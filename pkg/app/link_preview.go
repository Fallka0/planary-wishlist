package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	htmlpkg "html"
	"io"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"planary-wishlist/pkg/models"
)

const maxMetadataBodySize = 2 << 20

var (
	metaTagPattern    = regexp.MustCompile(`(?is)<meta\s+[^>]*(?:property|name|itemprop)\s*=\s*['"]?([^'">\s]+)['"]?[^>]*content\s*=\s*['"]([^'"]+)['"][^>]*>`)
	titleTagPattern   = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
	ldJSONPattern     = regexp.MustCompile(`(?is)<script[^>]*type=['"]application/ld\+json['"][^>]*>(.*?)</script>`)
	priceHintPattern  = regexp.MustCompile(`(?i)(CHF|EUR|USD|\$|£|€)\s*([0-9]+(?:[.,][0-9]{2})?)`)
	whitespacePattern = regexp.MustCompile(`\s+`)
	stripTagPattern   = regexp.MustCompile(`(?is)<[^>]+>`)
)

type linkMetadata struct {
	Title      string
	ImageURL   string
	PriceCents int64
	Currency   string // ISO 4217 when the page names one, else ""
}

// LinkPreview reads name, picture and price from a product page for the Add dialog.
// A page without a readable title is a 422 "unreadable" that still carries the store.
func LinkPreview(ctx context.Context, rawURL string) (models.LinkPreview, error) {
	return linkPreviewWith(ctx, defaultPolicy, safeClient, rawURL)
}

func linkPreviewWith(ctx context.Context, p fetchPolicy, client *http.Client, rawURL string) (models.LinkPreview, error) {
	cleaned, err := cleanWebURL(rawURL, "The link")
	if err != nil {
		return models.LinkPreview{}, err
	}
	if cleaned == "" {
		return models.LinkPreview{}, invalid("Paste a link first.")
	}
	store := StoreFromURL(cleaned)

	meta, err := fetchLinkMetadataWith(ctx, p, client, cleaned)
	if err != nil || meta.Title == "" {
		return models.LinkPreview{}, &Error{
			Status:  http.StatusUnprocessableEntity,
			Code:    "unreadable",
			Message: "We couldn't read details from " + store + ".",
			Store:   store,
		}
	}

	image := meta.ImageURL
	if u, err := url.Parse(image); err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		image = ""
	}
	return models.LinkPreview{
		URL:        cleaned,
		Store:      store,
		Title:      truncateRunes(meta.Title, 200),
		ImageURL:   image,
		PriceCents: meta.PriceCents,
		Currency:   firstNonEmpty(meta.Currency, "CHF"),
	}, nil
}

func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return strings.TrimSpace(string(r[:n]))
}

func fetchLinkMetadataWith(ctx context.Context, p fetchPolicy, client *http.Client, rawURL string) (linkMetadata, error) {
	normalizedURL, err := normalizeLinkURL(rawURL)
	if err != nil {
		return linkMetadata{}, err
	}

	resp, err := safeGet(ctx, p, client, normalizedURL)
	if err != nil {
		return linkMetadata{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		return linkMetadata{}, fmt.Errorf("metadata fetch failed with status %d", resp.StatusCode)
	}

	if contentType := resp.Header.Get("Content-Type"); contentType != "" && !strings.Contains(strings.ToLower(contentType), "html") {
		return linkMetadata{}, errors.New("linked resource is not an HTML page")
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxMetadataBodySize))
	if err != nil {
		return linkMetadata{}, err
	}

	page := string(body)
	meta := extractMetadataFromHTML(page)
	// Resolve against the final URL, after redirects.
	meta.ImageURL = resolveMetadataURL(resp.Request.URL.String(), meta.ImageURL)
	return meta, nil
}

func extractMetadataFromHTML(html string) linkMetadata {
	values := make(map[string]string)
	for _, match := range metaTagPattern.FindAllStringSubmatch(html, -1) {
		key := strings.ToLower(strings.TrimSpace(match[1]))
		if _, exists := values[key]; !exists {
			values[key] = strings.TrimSpace(match[2])
		}
	}

	meta := linkMetadata{
		Title: firstNonEmpty(
			values["og:title"],
			values["twitter:title"],
			values["title"],
			extractTitleTag(html),
		),
		ImageURL: firstNonEmpty(
			values["og:image"],
			values["og:image:url"],
			values["twitter:image"],
			values["image"],
		),
		PriceCents: firstPositive(
			parsePriceToCents(values["product:price:amount"]),
			parsePriceToCents(values["og:price:amount"]),
			parsePriceToCents(values["price"]),
			parsePriceToCents(values["product:price"]),
		),
		Currency: firstNonEmpty(
			currencyCode(values["product:price:currency"]),
			currencyCode(values["og:price:currency"]),
			currencyCode(values["pricecurrency"]),
		),
	}

	if meta.ImageURL == "" || meta.PriceCents == 0 || meta.Title == "" || meta.Currency == "" {
		enriched := extractMetadataFromJSONLD(html)
		meta.Title = firstNonEmpty(meta.Title, enriched.Title)
		meta.ImageURL = firstNonEmpty(meta.ImageURL, enriched.ImageURL)
		if meta.PriceCents == 0 && enriched.PriceCents > 0 {
			meta.PriceCents = enriched.PriceCents
			meta.Currency = firstNonEmpty(enriched.Currency, meta.Currency)
		}
		meta.Currency = firstNonEmpty(meta.Currency, enriched.Currency)
	}

	if meta.PriceCents == 0 {
		cents, currency := parsePriceFromText(html)
		meta.PriceCents = cents
		meta.Currency = firstNonEmpty(meta.Currency, currency)
	}

	meta.Title = htmlpkg.UnescapeString(meta.Title)
	meta.ImageURL = htmlpkg.UnescapeString(meta.ImageURL)
	return meta
}

func extractMetadataFromJSONLD(html string) linkMetadata {
	matches := ldJSONPattern.FindAllStringSubmatch(html, -1)
	for _, match := range matches {
		var payload any
		if err := json.Unmarshal([]byte(strings.TrimSpace(match[1])), &payload); err != nil {
			continue
		}

		meta := metadataFromJSONValue(payload)
		if meta.Title != "" || meta.ImageURL != "" || meta.PriceCents > 0 {
			return meta
		}
	}

	return linkMetadata{}
}

func metadataFromJSONValue(value any) linkMetadata {
	switch typed := value.(type) {
	case []any:
		for _, item := range typed {
			meta := metadataFromJSONValue(item)
			if meta.Title != "" || meta.ImageURL != "" || meta.PriceCents > 0 {
				return meta
			}
		}
	case map[string]any:
		meta := linkMetadata{
			Title:    stringFromAny(typed["name"]),
			ImageURL: imageURLFromAny(typed["image"]),
		}

		if offers := typed["offers"]; offers != nil {
			meta.PriceCents, meta.Currency = priceFromOffers(offers)
		}

		if meta.PriceCents == 0 {
			meta.PriceCents = parsePriceToCents(stringFromAny(typed["price"]))
			meta.Currency = currencyCode(stringFromAny(typed["priceCurrency"]))
		}

		if meta.Title != "" || meta.ImageURL != "" || meta.PriceCents > 0 {
			return meta
		}

		for _, child := range typed {
			meta = metadataFromJSONValue(child)
			if meta.Title != "" || meta.ImageURL != "" || meta.PriceCents > 0 {
				return meta
			}
		}
	}

	return linkMetadata{}
}

func priceFromOffers(value any) (int64, string) {
	switch typed := value.(type) {
	case []any:
		for _, offer := range typed {
			if price, currency := priceFromOffers(offer); price > 0 {
				return price, currency
			}
		}
	case map[string]any:
		price := parsePriceToCents(firstNonEmpty(stringFromAny(typed["price"]), stringFromAny(typed["lowPrice"])))
		if price == 0 {
			price = parsePriceToCents(numberString(typed["price"]))
		}
		if price > 0 {
			return price, currencyCode(stringFromAny(typed["priceCurrency"]))
		}
		if spec := typed["priceSpecification"]; spec != nil {
			return priceFromOffers(spec)
		}
	}

	return 0, ""
}

// numberString handles JSON-LD prices written as numbers instead of strings.
func numberString(value any) string {
	if f, ok := value.(float64); ok {
		return strconv.FormatFloat(f, 'f', -1, 64)
	}
	return ""
}

var currencyPattern = regexp.MustCompile(`^[A-Z]{3}$`)

// currencyCode returns an ISO 4217 code, or "" when value isn't one.
func currencyCode(value string) string {
	value = strings.ToUpper(strings.TrimSpace(value))
	if currencyPattern.MatchString(value) {
		return value
	}
	return ""
}

var currencySymbols = map[string]string{"CHF": "CHF", "EUR": "EUR", "USD": "USD", "$": "USD", "£": "GBP", "€": "EUR"}

func stringFromAny(value any) string {
	if str, ok := value.(string); ok {
		return strings.TrimSpace(str)
	}
	return ""
}

func imageURLFromAny(value any) string {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case []any:
		for _, item := range typed {
			if candidate := imageURLFromAny(item); candidate != "" {
				return candidate
			}
		}
	case map[string]any:
		return firstNonEmpty(
			stringFromAny(typed["url"]),
			stringFromAny(typed["contentUrl"]),
		)
	}
	return ""
}

func extractTitleTag(html string) string {
	match := titleTagPattern.FindStringSubmatch(html)
	if len(match) < 2 {
		return ""
	}

	title := stripTagPattern.ReplaceAllString(match[1], " ")
	title = whitespacePattern.ReplaceAllString(title, " ")
	return strings.TrimSpace(title)
}

func parsePriceToCents(raw string) int64 {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0
	}

	sanitized := strings.Map(func(r rune) rune {
		switch {
		case r >= '0' && r <= '9':
			return r
		case r == '.' || r == ',':
			return r
		default:
			return -1
		}
	}, raw)

	if sanitized == "" {
		return 0
	}

	if strings.Contains(sanitized, ",") && strings.Contains(sanitized, ".") {
		if strings.LastIndex(sanitized, ",") > strings.LastIndex(sanitized, ".") {
			sanitized = strings.ReplaceAll(sanitized, ".", "")
			sanitized = strings.ReplaceAll(sanitized, ",", ".")
		} else {
			sanitized = strings.ReplaceAll(sanitized, ",", "")
		}
	} else if strings.Count(sanitized, ",") == 1 && !strings.Contains(sanitized, ".") {
		sanitized = strings.ReplaceAll(sanitized, ",", ".")
	} else {
		sanitized = strings.ReplaceAll(sanitized, ",", "")
	}

	value, err := strconv.ParseFloat(sanitized, 64)
	if err != nil || value <= 0 {
		return 0
	}

	return int64(math.Round(value * 100))
}

func parsePriceFromText(html string) (int64, string) {
	text := stripTagPattern.ReplaceAllString(html, " ")
	match := priceHintPattern.FindStringSubmatch(text)
	if len(match) < 3 {
		return 0, ""
	}
	return parsePriceToCents(match[2]), currencySymbols[strings.ToUpper(match[1])]
}

func normalizeLinkURL(rawURL string) (string, error) {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return "", errors.New("product URL is required to fetch metadata")
	}

	if !strings.Contains(rawURL, "://") {
		rawURL = "https://" + rawURL
	}

	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "", errors.New("product URL is invalid")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", errors.New("product URL must start with http or https")
	}
	if parsed.Host == "" {
		return "", errors.New("product URL is invalid")
	}
	return parsed.String(), nil
}

func resolveMetadataURL(pageURL, assetURL string) string {
	assetURL = strings.TrimSpace(assetURL)
	if assetURL == "" {
		return ""
	}

	base, err := url.Parse(pageURL)
	if err != nil {
		return assetURL
	}

	parsedAsset, err := url.Parse(assetURL)
	if err != nil {
		return assetURL
	}

	return base.ResolveReference(parsedAsset).String()
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func firstPositive(values ...int64) int64 {
	for _, value := range values {
		if value > 0 {
			return value
		}
	}
	return 0
}
