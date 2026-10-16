package handler

import (
	"net/http"

	"planary-wishlist/pkg/httpapi"
)

func OccasionsHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.Occasions(w, r)
}
