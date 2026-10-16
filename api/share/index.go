package handler

import (
	"net/http"

	"planary-wishlist/pkg/httpapi"
)

func ShareHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.Share(w, r)
}
