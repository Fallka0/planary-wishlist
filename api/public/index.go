package handler

import (
	"net/http"

	"planary-wishlist/pkg/httpapi"
)

func PublicHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.Public(w, r)
}
