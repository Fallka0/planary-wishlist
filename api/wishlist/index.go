package handler

import (
	"net/http"

	"planary-wishlist/internal/httpapi"
)

func WishlistHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.Wishlist(w, r)
}
