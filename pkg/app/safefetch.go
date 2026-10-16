package app

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"syscall"
	"time"
)

// The link preview fetches pages that users name, so it must never reach anything inside our network.
// Every connection is checked at dial time, after DNS, so a hostname that resolves (or re-resolves) to
// a private address is refused, and redirects are dialled through the same check.

const (
	fetchTimeout = 8 * time.Second
	maxRedirects = 3
)

var errBlockedAddress = errors.New("address not allowed")

var blockedPrefixes = func() []netip.Prefix {
	var out []netip.Prefix
	for _, s := range []string{
		"0.0.0.0/8",       // "this network"
		"10.0.0.0/8",      // private
		"100.64.0.0/10",   // carrier-grade NAT
		"127.0.0.0/8",     // loopback
		"169.254.0.0/16",  // link-local, cloud metadata
		"172.16.0.0/12",   // private
		"192.0.0.0/24",    // IETF protocol assignments
		"192.0.2.0/24",    // documentation
		"192.168.0.0/16",  // private
		"198.18.0.0/15",   // benchmarking
		"198.51.100.0/24", // documentation
		"203.0.113.0/24",  // documentation
		"224.0.0.0/4",     // multicast
		"240.0.0.0/4",     // reserved, broadcast
		"::/128",          // unspecified
		"::1/128",         // loopback
		"64:ff9b::/96",    // NAT64, could map to a private v4 address
		"64:ff9b:1::/48",  // local-use NAT64
		"100::/64",        // discard
		"2001::/32",       // Teredo
		"2001:db8::/32",   // documentation
		"2002::/16",       // 6to4, embeds a v4 address
		"fc00::/7",        // unique local
		"fe80::/10",       // link-local
		"ff00::/8",        // multicast
	} {
		out = append(out, netip.MustParsePrefix(s))
	}
	return out
}()

// blockedIP reports whether the preview may not connect to ip.
func blockedIP(ip netip.Addr) bool {
	ip = ip.Unmap() // ::ffff:10.0.0.1 is 10.0.0.1
	if !ip.IsValid() || !ip.IsGlobalUnicast() {
		return true
	}
	for _, p := range blockedPrefixes {
		if p.Contains(ip) {
			return true
		}
	}
	return false
}

// fetchPolicy says where the preview may connect. Production uses defaultPolicy; tests loosen it
// to reach httptest servers on 127.0.0.1 and random ports.
type fetchPolicy struct {
	blocked func(netip.Addr) bool
	anyPort bool
}

var defaultPolicy = fetchPolicy{blocked: blockedIP}

func (p fetchPolicy) portAllowed(port string) bool {
	return p.anyPort || port == "" || port == "80" || port == "443"
}

// checkURL allows only http(s) with a host, on the default ports.
func (p fetchPolicy) checkURL(u *url.URL) error {
	if (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || !p.portAllowed(u.Port()) {
		return fmt.Errorf("%w: %s", errBlockedAddress, u.Redacted())
	}
	return nil
}

// client builds the preview's HTTP client.
func (p fetchPolicy) client() *http.Client {
	dialer := &net.Dialer{
		Timeout: fetchTimeout,
		Control: func(network, address string, _ syscall.RawConn) error {
			host, port, err := net.SplitHostPort(address)
			if err != nil {
				return err
			}
			ip, err := netip.ParseAddr(host)
			if err != nil || p.blocked(ip) || !p.portAllowed(port) {
				return fmt.Errorf("%w: %s", errBlockedAddress, address)
			}
			return nil
		},
	}
	transport := &http.Transport{
		Proxy:                 nil, // a proxy would dial on our behalf and skip the check above
		DialContext:           dialer.DialContext,
		TLSHandshakeTimeout:   fetchTimeout,
		ResponseHeaderTimeout: fetchTimeout,
		MaxIdleConns:          10,
		IdleConnTimeout:       30 * time.Second,
	}
	return &http.Client{
		Timeout:   fetchTimeout,
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) > maxRedirects {
				return errors.New("too many redirects")
			}
			return p.checkURL(req.URL)
		},
	}
}

var safeClient = defaultPolicy.client()

// safeGet fetches a page for the preview.
func safeGet(ctx context.Context, p fetchPolicy, client *http.Client, rawURL string) (*http.Response, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, err
	}
	if err := p.checkURL(u); err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "PlanaryWishlistBot/2.0 (+https://planary.ch/wishlist)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8")
	return client.Do(req)
}
