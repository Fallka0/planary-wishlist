package httpapi

import (
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"

	"planary-wishlist/pkg/app"
	"planary-wishlist/pkg/auth"
	"planary-wishlist/pkg/httpx"
)

// authenticate checks the bearer token. Tests replace it.
var authenticate = auth.UserFromRequest

// requireUser checks the bearer token and refreshes the caller's profile (email and display name).
func requireUser(w http.ResponseWriter, r *http.Request) (auth.User, bool) {
	user, err := authenticate(r)
	if err != nil {
		httpx.ErrorCode(w, http.StatusUnauthorized, "unauthorized", "Sign in to continue.")
		return auth.User{}, false
	}
	// The profile is only a cache of names, so a failed write shouldn't fail the request.
	if err := app.UpsertProfile(r.Context(), user); err != nil {
		log.Printf("upsert profile %s: %v", user.ID, err)
	}
	return user, true
}

// optionalUser is the signed-in user on pages that also work without an account. A missing or
// expired token counts as a guest.
func optionalUser(r *http.Request) (auth.User, bool) {
	if strings.TrimSpace(r.Header.Get("Authorization")) == "" {
		return auth.User{}, false
	}
	user, err := authenticate(r)
	if err != nil {
		return auth.User{}, false
	}
	if err := app.UpsertProfile(r.Context(), user); err != nil {
		log.Printf("upsert profile %s: %v", user.ID, err)
	}
	return user, true
}

// writeError sends an app.Error as is and hides everything else behind a 500.
func writeError(w http.ResponseWriter, r *http.Request, err error) {
	var appErr *app.Error
	if errors.As(err, &appErr) {
		body := map[string]string{"error": appErr.Message, "code": appErr.Code}
		if appErr.Store != "" {
			body["store"] = appErr.Store
		}
		httpx.JSON(w, appErr.Status, body)
		return
	}
	log.Printf("%s %s: %v", r.Method, r.URL.Path, err)
	httpx.ErrorCode(w, http.StatusInternalServerError, "server", "Something went wrong on our side. Try again in a moment.")
}

const maxBody = 64 << 10

// decode reads a JSON body into v.
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxBody)
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		httpx.ErrorCode(w, http.StatusBadRequest, "invalid", "We couldn't read that request.")
		return false
	}
	return true
}

// queryID reads a positive integer id from the query string.
func queryID(w http.ResponseWriter, r *http.Request, key string) (int64, bool) {
	id, err := strconv.ParseInt(r.URL.Query().Get(key), 10, 64)
	if err != nil || id <= 0 {
		httpx.ErrorCode(w, http.StatusBadRequest, "invalid", "Missing or invalid "+key+".")
		return 0, false
	}
	return id, true
}

func methodNotAllowed(w http.ResponseWriter) {
	httpx.ErrorCode(w, http.StatusMethodNotAllowed, "invalid", "Method not allowed.")
}

// baseURL is where share and invite links point: PUBLIC_APP_URL, else the request's own host.
func baseURL(r *http.Request) string {
	if u := strings.TrimRight(os.Getenv("PUBLIC_APP_URL"), "/"); u != "" {
		return u
	}
	scheme := "https"
	if proto := r.Header.Get("X-Forwarded-Proto"); proto != "" {
		scheme = strings.TrimSpace(strings.Split(proto, ",")[0])
	} else if r.TLS == nil {
		scheme = "http"
	}
	return scheme + "://" + r.Host
}

// clientIP is the visitor's address for the reservation limit. Vercel sets X-Forwarded-For.
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
