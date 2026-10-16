package handler

import (
	"net/http"

	"planary-wishlist/pkg/httpapi"
)

func InviteAcceptHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.InviteAccept(w, r)
}
