package httpapi

import "net/http"

// Routes maps every API path to its handler. cmd/local-api serves these; on Vercel each one has
// its own file under api/ (keep both in step).
var Routes = map[string]http.HandlerFunc{
	"/api/health": Health,

	// v2
	"/api/me":             MeV2,
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

	// v1, used by the current frontend until v2 ships. /api/auth/me keeps its old shape.
	"/api/auth/register":  Register,
	"/api/auth/login":     Login,
	"/api/auth/logout":    Logout,
	"/api/auth/me":        Me,
	"/api/wishlist":       Wishlist,
	"/api/wishlist/items": WishlistItems,
}

// Mux serves Routes.
func Mux() *http.ServeMux {
	mux := http.NewServeMux()
	for path, h := range Routes {
		mux.HandleFunc(path, h)
	}
	return mux
}
