package handler

import (
	"net/http"

	"planary-wishlist/pkg/httpapi"
)

func PublicReserveHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.PublicReserve(w, r)
}
