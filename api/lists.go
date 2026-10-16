package handler

import (
	"net/http"

	"planary-wishlist/pkg/httpapi"
)

func ListsHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.Lists(w, r)
}
