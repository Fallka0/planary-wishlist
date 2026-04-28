package handler

import (
	"net/http"

	"planary-wishlist/internal/httpapi"
)

func WishlistItemsHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.WishlistItems(w, r)
}
