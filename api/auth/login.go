package handler

import (
	"net/http"

	"planary-wishlist/internal/httpapi"
)

func LoginHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.Login(w, r)
}
