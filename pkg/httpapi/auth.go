package httpapi

import (
	"net/http"

	"planary-wishlist/pkg/auth"
	"planary-wishlist/pkg/httpx"
)

func Register(w http.ResponseWriter, r *http.Request) {
	httpx.Error(w, http.StatusGone, "use auth.planary.ch to create an account")
}

func Login(w http.ResponseWriter, r *http.Request) {
	httpx.Error(w, http.StatusGone, "use auth.planary.ch to sign in")
}

func Logout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func Me(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		httpx.Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	user, err := auth.UserFromRequest(r)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"user": map[string]string{
			"id":    user.ID,
			"email": user.Email,
		},
	})
}
