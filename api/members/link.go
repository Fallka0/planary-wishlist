package handler

import (
	"net/http"

	"planary-wishlist/pkg/httpapi"
)

func MembersLinkHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.MembersLink(w, r)
}
