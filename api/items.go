package handler

import (
	"net/http"

	"planary-wishlist/pkg/httpapi"
)

func ItemsHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.Items(w, r)
}
