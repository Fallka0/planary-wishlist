package handler

import (
	"net/http"

	"planary-wishlist/pkg/httpapi"
)

func LinkPreviewHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.LinkPreview(w, r)
}
