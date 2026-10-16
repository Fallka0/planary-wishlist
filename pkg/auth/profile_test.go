package auth

import "testing"

func TestDisplayName(t *testing.T) {
	tests := []struct {
		name string
		user User
		want string
	}{
		{"display_name wins", User{Email: "noa@example.ch", UserMetadata: map[string]any{"display_name": "Noa", "full_name": "Noa Brunner"}}, "Noa"},
		{"full_name next", User{Email: "noa@example.ch", UserMetadata: map[string]any{"full_name": " Noa Brunner ", "name": "nb"}}, "Noa Brunner"},
		{"name next", User{Email: "noa@example.ch", UserMetadata: map[string]any{"name": "nb"}}, "nb"},
		{"blank and non-string values are skipped", User{Email: "noa@example.ch", UserMetadata: map[string]any{"display_name": "  ", "full_name": 42}}, "noa"},
		{"no metadata uses the email", User{Email: "noa.brunner@example.ch"}, "noa.brunner"},
		{"nothing at all", User{}, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := DisplayName(tt.user); got != tt.want {
				t.Fatalf("DisplayName() = %q, want %q", got, tt.want)
			}
		})
	}
}
