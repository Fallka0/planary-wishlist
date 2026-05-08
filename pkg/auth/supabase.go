package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

type User struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

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

func UserFromRequest(r *http.Request) (User, error) {
	token, err := bearerToken(r)
	if err != nil {
		return User{}, err
	}

	supabaseURL := strings.TrimRight(os.Getenv("SUPABASE_URL"), "/")
	supabaseAnonKey := os.Getenv("SUPABASE_ANON_KEY")
	if supabaseURL == "" || supabaseAnonKey == "" {
		return User{}, errors.New("SUPABASE_URL and SUPABASE_ANON_KEY are required")
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, supabaseURL+"/auth/v1/user", nil)
	if err != nil {
		return User{}, err
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("apikey", supabaseAnonKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return User{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return User{}, fmt.Errorf("supabase auth returned %s", resp.Status)
	}

	var user User
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return User{}, err
	}

	if user.ID == "" {
		return User{}, errors.New("supabase returned empty user id")
	}

	return user, nil
}
