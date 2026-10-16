package app

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"net/url"
	"strings"
	"testing"
)

func TestBlockedIP(t *testing.T) {
	blocked := []string{
		"127.0.0.1", "127.8.9.10", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1",
		"169.254.169.254",               // cloud metadata
		"100.64.0.1", "100.127.255.254", // CGNAT
		"0.0.0.0", "0.1.2.3", "224.0.0.1", "239.255.255.250", "255.255.255.255", "240.0.0.1",
		"198.18.0.1", "192.0.2.1",
		"::", "::1", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1",
		"::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:169.254.169.254", // v4-mapped
		"64:ff9b::a00:1", // NAT64 for 10.0.0.1
		"2002:a00:1::1",  // 6to4 for 10.0.0.1
		"2001:0:4136::1", // Teredo
		"2001:db8::1",
	}
	for _, s := range blocked {
		if !blockedIP(netip.MustParseAddr(s)) {
			t.Errorf("%s should be blocked", s)
		}
	}
	allowed := []string{"8.8.8.8", "1.1.1.1", "172.32.0.1", "100.128.0.1", "2606:4700:4700::1111", "2a00:1450:4001::200e"}
	for _, s := range allowed {
		if blockedIP(netip.MustParseAddr(s)) {
			t.Errorf("%s should be allowed", s)
		}
	}
}

func TestCheckURL(t *testing.T) {
	for raw, ok := range map[string]bool{
		"https://www.galaxus.ch/p/1": true,
		"http://shop.ch:80/x":        true,
		"https://shop.ch:443/x":      true,
		"https://shop.ch:8443/x":     false,
		"http://shop.ch:22/":         false,
		"ftp://shop.ch/file":         false,
		"file:///etc/passwd":         false,
		"gopher://shop.ch/":          false,
		"https:///nohost":            false,
	} {
		u, err := url.Parse(raw)
		if err != nil {
			t.Fatal(err)
		}
		if got := defaultPolicy.checkURL(u) == nil; got != ok {
			t.Errorf("checkURL(%s) allowed = %v, want %v", raw, got, ok)
		}
	}
}

// loopbackPolicy reaches httptest servers (127.0.0.1, random port) but blocks everything else that's blocked.
var loopbackPolicy = fetchPolicy{
	anyPort: true,
	blocked: func(ip netip.Addr) bool { return ip != netip.MustParseAddr("127.0.0.1") && blockedIP(ip) },
}

func get(p fetchPolicy, rawURL string) error {
	resp, err := safeGet(context.Background(), p, p.client(), rawURL)
	if err == nil {
		resp.Body.Close()
	}
	return err
}

func TestSafeGetRefusesLoopback(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer srv.Close()

	// Same server, reached by IP and by a name that resolves to it.
	byName := strings.Replace(srv.URL, "127.0.0.1", "localhost", 1)
	for _, u := range []string{srv.URL, byName} {
		err := get(fetchPolicy{blocked: blockedIP, anyPort: true}, u)
		if !errors.Is(err, errBlockedAddress) {
			t.Errorf("%s: err = %v, want blocked", u, err)
		}
	}
}

func TestSafeGetChecksEveryRedirect(t *testing.T) {
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/metadata":
			http.Redirect(w, r, "http://169.254.169.254/latest/meta-data/", http.StatusFound)
		case "/mapped":
			http.Redirect(w, r, "http://[::ffff:10.0.0.1]/", http.StatusFound)
		case "/scheme":
			http.Redirect(w, r, "file:///etc/passwd", http.StatusFound)
		case "/loop":
			http.Redirect(w, r, srv.URL+"/loop", http.StatusFound)
		case "/twice":
			http.Redirect(w, r, srv.URL+"/once", http.StatusFound)
		case "/once":
			http.Redirect(w, r, srv.URL+"/ok", http.StatusFound)
		case "/ok":
			w.Write([]byte("<title>ok</title>"))
		}
	}))
	defer srv.Close()

	for _, path := range []string{"/metadata", "/mapped", "/scheme", "/loop"} {
		if err := get(loopbackPolicy, srv.URL+path); err == nil {
			t.Errorf("%s: redirect was followed", path)
		}
	}
	if err := get(loopbackPolicy, srv.URL+"/twice"); err != nil {
		t.Errorf("two redirects within the limit: %v", err)
	}
}

func TestLinkPreview(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/headphones":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Write([]byte(`<html><head>
<meta property="og:title" content="Sony WH-1000XM5 &amp; case">
<meta property="og:image" content="/img/xm5.jpg">
<meta property="product:price:amount" content="349.00">
<meta property="product:price:currency" content="chf">
</head></html>`))
		case "/jsonld":
			w.Write([]byte(`<script type="application/ld+json">{"@type":"Product","name":"Lamp","image":["https://cdn.example/lamp.png"],
"offers":{"@type":"Offer","price":59.9,"priceCurrency":"EUR"}}</script>`))
		case "/empty":
			w.Write([]byte(`<html><body>No product here</body></html>`))
		case "/pdf":
			w.Header().Set("Content-Type", "application/pdf")
			w.Write([]byte("%PDF"))
		}
	}))
	defer srv.Close()
	ctx := context.Background()
	client := loopbackPolicy.client()

	p, err := linkPreviewWith(ctx, loopbackPolicy, client, srv.URL+"/headphones")
	if err != nil {
		t.Fatal(err)
	}
	if p.Title != "Sony WH-1000XM5 & case" || p.PriceCents != 34900 || p.Currency != "CHF" ||
		p.ImageURL != srv.URL+"/img/xm5.jpg" || p.Store != "127.0.0.1" {
		t.Fatalf("preview = %+v", p)
	}

	p, err = linkPreviewWith(ctx, loopbackPolicy, client, srv.URL+"/jsonld")
	if err != nil {
		t.Fatal(err)
	}
	if p.Title != "Lamp" || p.PriceCents != 5990 || p.Currency != "EUR" || p.ImageURL != "https://cdn.example/lamp.png" {
		t.Fatalf("json-ld preview = %+v", p)
	}

	for _, path := range []string{"/empty", "/pdf"} {
		_, err = linkPreviewWith(ctx, loopbackPolicy, client, srv.URL+path)
		var appErr *Error
		if !errors.As(err, &appErr) || appErr.Code != "unreadable" || appErr.Status != 422 || appErr.Store != "127.0.0.1" {
			t.Errorf("%s: err = %#v, want 422 unreadable with store", path, err)
		}
	}

	_, err = linkPreviewWith(ctx, loopbackPolicy, client, "javascript:alert(1)")
	var appErr *Error
	if !errors.As(err, &appErr) || appErr.Code != "invalid" {
		t.Errorf("javascript: URL err = %v, want invalid", err)
	}
}
