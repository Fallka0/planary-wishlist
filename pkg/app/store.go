package app

import (
	"net/url"
	"strings"
)

// StoreFromURL is the shop name shown under an item: the host, lowercase, without "www." or a port.
func StoreFromURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	host := strings.ToLower(parsed.Hostname())
	return strings.TrimPrefix(host, "www.")
}

// cleanWebURL accepts an empty string or an http(s) URL with a host. A bare "shop.ch/x" gets https://.
func cleanWebURL(raw, field string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", nil
	}
	if len(raw) > 2000 {
		return "", invalid(field + " is too long.")
	}
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	parsed, err := url.Parse(raw)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return "", invalid(field + " needs to be a web address.")
	}
	return parsed.String(), nil
}
