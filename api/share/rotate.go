package handler

import (
	"net/http"

	"planary-wishlist/pkg/httpapi"
)

func ShareRotateHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.ShareRotate(w, r)
}
