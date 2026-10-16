package handler

import (
	"net/http"

	"planary-wishlist/pkg/httpapi"
)

func SearchHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.Search(w, r)
}
