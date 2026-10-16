package handler

import (
	"net/http"

	"planary-wishlist/pkg/httpapi"
)

// RouterHandler is the only Vercel function: vercel.json rewrites every /api/* request here, and
// httpapi.Router dispatches it with the same route table cmd/local-api uses. One function instead of
// one per route keeps the deployment under the Hobby plan's limit of 12 functions.
func RouterHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.Router(w, r)
}
