package auth

import (
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

func TestUserFromRequest(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.URL.Path != "/api/auth/me" || r.Header.Get("Authorization") != "Bearer good" {
			http.Error(w, `{"error":"not authenticated"}`, http.StatusUnauthorized)
			return
		}
		w.Write([]byte(`{"user":{"id":"11111111-1111-4111-8111-111111111111","email":"noa@example.ch","name":"Noa Brunner","createdAt":"2026-09-18T00:00:00Z"}}`))
	}))
	defer srv.Close()
	t.Setenv("AUTH_API_URL", srv.URL+"/")

	req := func(header string) *http.Request {
		r := httptest.NewRequest("GET", "/api/me", nil)
		if header != "" {
			r.Header.Set("Authorization", header)
		}
		return r
	}

	user, err := UserFromRequest(req("Bearer good"))
	if err != nil || user.ID != "11111111-1111-4111-8111-111111111111" || user.Name != "Noa Brunner" || user.Email != "noa@example.ch" {
		t.Fatalf("user = %+v, err = %v", user, err)
	}
	if _, err := UserFromRequest(req("Bearer good")); err != nil || calls.Load() != 1 {
		t.Fatalf("second call should come from the cache (calls = %d, err = %v)", calls.Load(), err)
	}
	for _, h := range []string{"", "Bearer ", "Basic abc", "Bearer bad"} {
		if _, err := UserFromRequest(req(h)); err == nil {
			t.Errorf("header %q was accepted", h)
		}
	}
}
