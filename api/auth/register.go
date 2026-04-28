package handler

import (
	"net/http"

	"planary-wishlist/pkg/httpapi"
)

func RegisterHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.Register(w, r)
}
