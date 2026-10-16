package httpapi

import (
	"io/fs"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

// Every route needs a Vercel entrypoint under api/ and a local route; this keeps the two in step.
func TestEveryRouteHasAVercelFile(t *testing.T) {
	root := filepath.Join("..", "..", "api")
	files := map[string]bool{}
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".go") {
			return err
		}
		rel, _ := filepath.Rel(root, path)
		route := "/api/" + strings.TrimSuffix(filepath.ToSlash(rel), ".go")
		route = strings.TrimSuffix(route, "/index")
		files[route] = true
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	var missing, extra []string
	for route := range Routes {
		if !files[route] {
			missing = append(missing, route)
		}
	}
	for route := range files {
		if _, ok := Routes[route]; !ok {
			extra = append(extra, route)
		}
	}
	sort.Strings(missing)
	sort.Strings(extra)
	if len(missing) > 0 || len(extra) > 0 {
		t.Fatalf("routes without an api/ file: %v; api/ files without a route: %v", missing, extra)
	}
}
