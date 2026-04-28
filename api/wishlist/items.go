package handler

import (
	"net/http"

	"planary-wishlist/pkg/httpapi"
)

func WishlistItemsHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.WishlistItems(w, r)
}
