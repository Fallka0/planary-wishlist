package handler

import (
	"net/http"

	"planary-wishlist/pkg/httpapi"
)

func LogoutHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.Logout(w, r)
}
