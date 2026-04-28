package handler

import (
	"net/http"

	"planary-wishlist/pkg/httpapi"
)

func LoginHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.Login(w, r)
}
