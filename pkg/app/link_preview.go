package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const maxMetadataBodySize = 2 << 20

var (
	metaTagPattern    = regexp.MustCompile(`(?is)<meta\s+[^>]*(?:property|name|itemprop)\s*=\s*['"]?([^'">\s]+)['"]?[^>]*content\s*=\s*['"]([^'"]+)['"][^>]*>`)
	titleTagPattern   = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
	ldJSONPattern     = regexp.MustCompile(`(?is)<script[^>]*type=['"]application/ld\+json['"][^>]*>(.*?)</script>`)
	priceHintPattern  = regexp.MustCompile(`(?i)(?:CHF|EUR|USD|\$|£|€)\s*([0-9]+(?:[.,][0-9]{2})?)`)
	whitespacePattern = regexp.MustCompile(`\s+`)
	stripTagPattern   = regexp.MustCompile(`(?is)<[^>]+>`)
)

type linkMetadata struct {
	Title      string
	ImageURL   string
	PriceCents int64
}

func fetchLinkMetadata(ctx context.Context, rawURL string) (linkMetadata, error) {
	normalizedURL, err := normalizeLinkURL(rawURL)
	if err != nil {
		return linkMetadata{}, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, normalizedURL, nil)
	if err != nil {
		return linkMetadata{}, err
	}

	req.Header.Set("User-Agent", "PlanaryWishlistBot/1.0 (+https://planary.app)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
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

	html := string(body)
	meta := extractMetadataFromHTML(html)
	meta.ImageURL = resolveMetadataURL(normalizedURL, meta.ImageURL)
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
	}

	if meta.ImageURL == "" || meta.PriceCents == 0 || meta.Title == "" {
		enriched := extractMetadataFromJSONLD(html)
		meta.Title = firstNonEmpty(meta.Title, enriched.Title)
		meta.ImageURL = firstNonEmpty(meta.ImageURL, enriched.ImageURL)
		meta.PriceCents = firstPositive(meta.PriceCents, enriched.PriceCents)
	}

	if meta.PriceCents == 0 {
		meta.PriceCents = parsePriceToCentsFromText(html)
	}

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
			meta.PriceCents = priceCentsFromOffers(offers)
		}

		if meta.PriceCents == 0 {
			meta.PriceCents = parsePriceToCents(stringFromAny(typed["price"]))
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

func priceCentsFromOffers(value any) int64 {
	switch typed := value.(type) {
	case []any:
		for _, offer := range typed {
			if price := priceCentsFromOffers(offer); price > 0 {
				return price
			}
		}
	case map[string]any:
		if price := parsePriceToCents(stringFromAny(typed["price"])); price > 0 {
			return price
		}
	}

	return 0
}

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

func parsePriceToCentsFromText(html string) int64 {
	text := stripTagPattern.ReplaceAllString(html, " ")
	match := priceHintPattern.FindStringSubmatch(text)
	if len(match) < 2 {
		return 0
	}
	return parsePriceToCents(match[1])
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
