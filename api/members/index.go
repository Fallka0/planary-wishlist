package handler

import (
	"net/http"

	"planary-wishlist/pkg/httpapi"
)

func MembersHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.Members(w, r)
}
