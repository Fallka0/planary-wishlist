package handler

import (
	"net/http"

	"planary-wishlist/pkg/httpapi"
)

func ClaimsHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.Claims(w, r)
}
