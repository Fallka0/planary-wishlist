package handler

import (
	"net/http"

	"planary-wishlist/pkg/httpapi"
)

func HealthHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.Health(w, r)
}
