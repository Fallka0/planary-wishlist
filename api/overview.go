package handler

import (
	"net/http"

	"planary-wishlist/pkg/httpapi"
)

func OverviewHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.Overview(w, r)
}
