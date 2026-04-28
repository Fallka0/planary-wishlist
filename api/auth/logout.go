package handler

import (
	"net/http"

	"planary-wishlist/internal/httpapi"
)

func LogoutHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.Logout(w, r)
}
