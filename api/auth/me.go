package handler

import (
	"net/http"

	"planary-wishlist/pkg/httpapi"
)

func MeHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.Me(w, r)
}
