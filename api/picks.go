package handler

import (
	"net/http"

	"planary-wishlist/pkg/httpapi"
)

func PicksHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.Picks(w, r)
}
