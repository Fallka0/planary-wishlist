package httpapi

import (
	"net/http"

	"planary-wishlist/internal/app"
	"planary-wishlist/internal/auth"
	"planary-wishlist/internal/httpx"
)

type authRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func Register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var payload authRequest
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user, err := app.CreateUser(r.Context(), payload.Email, payload.Password)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	token, err := auth.Issue(user.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not create session")
		return
	}

	auth.SetCookie(w, token)
	httpx.JSON(w, http.StatusCreated, map[string]any{"user": user})
}

func Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var payload authRequest
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user, err := app.AuthenticateUser(r.Context(), payload.Email, payload.Password)
	if err != nil {
		status := http.StatusBadRequest
		if err == app.ErrInvalidCredentials {
			status = http.StatusUnauthorized
		}
		httpx.Error(w, status, err.Error())
		return
	}

	token, err := auth.Issue(user.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not create session")
		return
	}

	auth.SetCookie(w, token)
	httpx.JSON(w, http.StatusOK, map[string]any{"user": user})
}

func Logout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	auth.ClearCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func Me(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		httpx.Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	userID, err := auth.UserIDFromRequest(r)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	user, err := app.GetUserByID(r.Context(), userID)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{"user": user})
}
