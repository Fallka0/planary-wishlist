// Package auth checks Planary account tokens. auth.planary.ch (planary-auth) signs people in and
// hands apps a short-lived access token; the API confirms it with planary-auth's /api/auth/me.
package auth

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

type User struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

// How long a confirmed token is trusted without asking planary-auth again. Tokens live an hour,
// so a signed-out or deleted account keeps working here for at most this long.
const cacheFor = 5 * time.Minute

func bearerToken(r *http.Request) (string, error) {
	value := strings.TrimSpace(r.Header.Get("Authorization"))
	if value == "" {
		return "", errors.New("missing authorization header")
	}
	token, found := strings.CutPrefix(value, "Bearer ")
	if !found || strings.TrimSpace(token) == "" {
		return "", errors.New("invalid authorization header")
	}
	return strings.TrimSpace(token), nil
}

// authAPI is planary-auth's base URL: AUTH_API_URL, or auth.planary.ch.
func authAPI() string {
	if u := strings.TrimRight(os.Getenv("AUTH_API_URL"), "/"); u != "" {
		return u
	}
	return "https://auth.planary.ch"
}

type cached struct {
	user  User
	until time.Time
}

var (
	cacheMu sync.Mutex
	cache   = map[[32]byte]cached{}
	client  = &http.Client{Timeout: 8 * time.Second}
)

// UserFromRequest returns the signed-in Planary account behind the request's bearer token.
func UserFromRequest(r *http.Request) (User, error) {
	token, err := bearerToken(r)
	if err != nil {
		return User{}, err
	}
	key := sha256.Sum256([]byte(token))
	now := time.Now()

	cacheMu.Lock()
	if c, ok := cache[key]; ok && now.Before(c.until) {
		cacheMu.Unlock()
		return c.user, nil
	}
	cacheMu.Unlock()

	user, err := fetchUser(r.Context(), token)
	if err != nil {
		return User{}, err
	}

	cacheMu.Lock()
	if len(cache) > 10_000 { // bound memory on a long-lived instance
		for k, c := range cache {
			if !now.Before(c.until) {
				delete(cache, k)
			}
		}
	}
	cache[key] = cached{user: user, until: now.Add(cacheFor)}
	cacheMu.Unlock()
	return user, nil
}

func fetchUser(ctx context.Context, token string) (User, error) {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, authAPI()+"/api/auth/me", nil)
	if err != nil {
		return User{}, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := client.Do(req)
	if err != nil {
		return User{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return User{}, fmt.Errorf("planary-auth returned %s", resp.Status)
	}
	var body struct {
		User User `json:"user"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return User{}, err
	}
	if body.User.ID == "" {
		return User{}, errors.New("planary-auth returned no user id")
	}
	return body.User, nil
}
