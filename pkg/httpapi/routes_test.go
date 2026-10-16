package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

// Vercel runs one function, api/router.go, and vercel.json sends every /api/* request to it.
func TestVercelRoutesEverythingThroughRouter(t *testing.T) {
	files, err := filepath.Glob(filepath.Join("..", "..", "api", "*"))
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 1 || filepath.Base(files[0]) != "router.go" {
		t.Fatalf("api/ should only hold router.go (Vercel's Hobby plan allows 12 functions), found %v", files)
	}

	raw, err := os.ReadFile(filepath.Join("..", "..", "vercel.json"))
	if err != nil {
		t.Fatal(err)
	}
	var cfg struct {
		Rewrites []struct{ Source, Destination string } `json:"rewrites"`
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		t.Fatal(err)
	}
	if len(cfg.Rewrites) == 0 || cfg.Rewrites[0].Source != "/api/:path*" || cfg.Rewrites[0].Destination != "/api/router?__path=:path*" {
		t.Fatalf("vercel.json must rewrite /api/:path* to the router first, got %+v", cfg.Rewrites)
	}
}

func TestRouterRestoresTheRewrittenPath(t *testing.T) {
	var gotPath, gotQuery string
	Routes["/api/test/echo"] = func(w http.ResponseWriter, r *http.Request) {
		gotPath, gotQuery = r.URL.Path, r.URL.RawQuery
	}
	defer delete(Routes, "/api/test/echo")
	mux = Mux()
	defer func() { mux = Mux() }()

	Router(httptest.NewRecorder(), httptest.NewRequest("GET", "/api/router?__path=test/echo&id=3", nil))
	if gotPath != "/api/test/echo" || gotQuery != "id=3" {
		t.Fatalf("path %q query %q", gotPath, gotQuery)
	}

	// Unknown paths are a 404, not the router itself.
	rec := httptest.NewRecorder()
	Router(rec, httptest.NewRequest("GET", "/api/router?__path=nope", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("unknown path: %d", rec.Code)
	}
}
