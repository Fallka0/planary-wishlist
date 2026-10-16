package app

import (
	"crypto/sha256"
	"encoding/hex"
	"regexp"
	"testing"
	"time"
)

func TestParsePriceToCents(t *testing.T) {
	for in, want := range map[string]int64{
		"349":          34900,
		"349.00":       34900,
		"349,90":       34990,
		"CHF 1'146.65": 114665,
		"1.146,65":     114665,
		"1,146.65":     114665,
		"€ 59.90":      5990,
		"":             0,
		"free":         0,
		"-5":           500, // the sign is stripped, never negative
		"0":            0,
	} {
		if got := parsePriceToCents(in); got != want {
			t.Errorf("parsePriceToCents(%q) = %d, want %d", in, got, want)
		}
	}
}

func TestPriceFromText(t *testing.T) {
	cents, currency := parsePriceFromText(`<span>Now only</span> <b>€ 49,90</b>`)
	if cents != 4990 || currency != "EUR" {
		t.Fatalf("got %d %s", cents, currency)
	}
	cents, currency = parsePriceFromText(`<p>chf 12.50</p>`)
	if cents != 1250 || currency != "CHF" {
		t.Fatalf("got %d %s", cents, currency)
	}
}

func TestStoreFromURL(t *testing.T) {
	for in, want := range map[string]string{
		"https://www.galaxus.ch/en/s1/product/123": "galaxus.ch",
		"https://WWW.Digitec.CH:443/x?y=1":         "digitec.ch",
		"http://shop.example.com/mug#top":          "shop.example.com",
		"zalando.ch/shoes":                         "zalando.ch",
		"https://www.ikea.com.":                    "ikea.com.",
		"":                                         "",
		"   ":                                      "",
	} {
		if got := StoreFromURL(in); got != want {
			t.Errorf("StoreFromURL(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestTokens(t *testing.T) {
	b64url := regexp.MustCompile(`^[A-Za-z0-9_-]+$`)
	share, secret := newShareToken(), newSecretToken()
	if len(share) != 22 || len(secret) != 43 || !b64url.MatchString(share) || !b64url.MatchString(secret) {
		t.Fatalf("tokens %q %q", share, secret)
	}
	if newSecretToken() == secret {
		t.Fatal("tokens repeat")
	}
	sum := sha256.Sum256([]byte("abc"))
	if hashToken("abc") != hex.EncodeToString(sum[:]) || hashToken("abc") != "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" {
		t.Fatal("hashToken isn't sha256 hex")
	}
}

func date(s string) time.Time {
	d, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return d
}

func TestNextOccurrence(t *testing.T) {
	y := func(n int) *int { return &n }
	tests := []struct {
		name       string
		month, day int
		year       *int
		from       string
		want       string // "" = none
	}{
		{"later this year", 11, 2, nil, "2026-10-16", "2026-11-02"},
		{"today counts", 10, 16, nil, "2026-10-16", "2026-10-16"},
		{"already passed rolls over", 3, 14, nil, "2026-10-16", "2027-03-14"},
		{"Feb 29 in a non-leap year is Feb 28", 2, 29, nil, "2026-10-16", "2027-02-28"},
		{"Feb 29 in a leap year", 2, 29, nil, "2027-10-16", "2028-02-29"},
		{"Dec 31 on Dec 31", 12, 31, nil, "2026-12-31", "2026-12-31"},
		{"Jan 1 from Dec 31", 1, 1, nil, "2026-12-31", "2027-01-01"},
		{"one-off in the future", 6, 20, y(2027), "2026-10-16", "2027-06-20"},
		{"one-off in the past drops out", 6, 20, y(2026), "2026-10-16", ""},
	}
	for _, tt := range tests {
		got, ok := NextOccurrence(tt.month, tt.day, tt.year, date(tt.from))
		if tt.want == "" {
			if ok {
				t.Errorf("%s: got %s, want none", tt.name, got.Format("2006-01-02"))
			}
			continue
		}
		if !ok || !got.Equal(date(tt.want)) {
			t.Errorf("%s: got %s (%v), want %s", tt.name, got.Format("2006-01-02"), ok, tt.want)
		}
	}
	if d := DaysBetween(date("2026-10-16"), date("2026-11-02")); d != 17 {
		t.Errorf("DaysBetween = %d, want 17", d)
	}
	// Across the DST change at the end of October.
	if d := DaysBetween(date("2026-10-24"), date("2026-10-26")); d != 2 {
		t.Errorf("DaysBetween across DST = %d, want 2", d)
	}
}

func TestDaysIn(t *testing.T) {
	if daysIn(2, 0) != 29 || daysIn(2, 2027) != 28 || daysIn(2, 2028) != 29 || daysIn(2, 2100) != 28 || daysIn(4, 0) != 30 || daysIn(12, 0) != 31 {
		t.Fatal("daysIn is wrong")
	}
}

func TestInitials(t *testing.T) {
	for in, want := range map[string]string{
		"Noa Brunner":       "NB",
		"noa.brunner":       "NB",
		"Lea":               "LE",
		"L":                 "L",
		"émile zola":        "ÉZ",
		"Anna Maria Keller": "AM",
		"":                  "?",
	} {
		if got := Initials(in); got != want {
			t.Errorf("Initials(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestRateLimiter(t *testing.T) {
	l := &rateLimiter{limit: 3, every: time.Hour, hits: map[string][]time.Time{}}
	now := time.Now()
	for i := 0; i < 3; i++ {
		if !l.allow("1.2.3.4", now) {
			t.Fatal("blocked too early")
		}
	}
	if l.allow("1.2.3.4", now) {
		t.Fatal("fourth hit allowed")
	}
	if !l.allow("5.6.7.8", now) {
		t.Fatal("other IPs are affected")
	}
	if !l.allow("1.2.3.4", now.Add(61*time.Minute)) {
		t.Fatal("still blocked after an hour")
	}
}
