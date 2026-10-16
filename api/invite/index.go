package handler

import (
	"net/http"

	"planary-wishlist/pkg/httpapi"
)

func InviteHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.Invite(w, r)
}
