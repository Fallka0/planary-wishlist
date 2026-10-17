package httpapi

import (
	"net/http"
	"strings"
)

// Routes maps every API path to its handler. cmd/local-api serves them with Mux; on Vercel the single
// function in api/router.go serves them through Router.
var Routes = map[string]http.HandlerFunc{
	"/api/health": Health,

	"/api/me":             Me,
	"/api/search":         Search,
	"/api/overview":       Overview,
	"/api/lists":          Lists,
	"/api/items":          Items,
	"/api/link-preview":   LinkPreview,
	"/api/occasions":      Occasions,
	"/api/picks":          Picks,
	"/api/claims":         Claims,
	"/api/share":          Share,
	"/api/share/rotate":   ShareRotate,
	"/api/public":         Public,
	"/api/public/reserve": PublicReserve,
	"/api/members":        Members,
	"/api/members/link":   MembersLink,
	"/api/invite":         Invite,
	"/api/invite/accept":  InviteAccept,
}

// Mux serves Routes.
func Mux() *http.ServeMux {
	mux := http.NewServeMux()
	for path, h := range Routes {
		mux.HandleFunc(path, h)
	}
	return mux
}

// rewrittenPathParam carries the original path when vercel.json rewrites /api/<path> to /api/router.
const rewrittenPathParam = "__path"

// Router serves Routes on Vercel. The rewrite in vercel.json turns /api/lists?id=3 into
// /api/router?__path=lists&id=3; Router puts the original path back before dispatching.
func Router(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	if p, ok := q[rewrittenPathParam]; ok {
		q.Del(rewrittenPathParam)
		r.URL.Path = "/api/" + strings.Trim(strings.Join(p, "/"), "/")
		r.URL.RawPath = ""
		r.URL.RawQuery = q.Encode()
	}
	mux.ServeHTTP(w, r)
}

var mux = Mux()
