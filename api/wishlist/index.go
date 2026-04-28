package handler

import (
	"net/http"

	"planary-wishlist/pkg/httpapi"
)

func WishlistHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.Wishlist(w, r)
}
