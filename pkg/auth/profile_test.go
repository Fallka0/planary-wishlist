package auth

import "testing"

func TestDisplayName(t *testing.T) {
	tests := []struct {
		name string
		user User
		want string
	}{
		{"account name", User{Email: "noa@example.ch", Name: " Noa   Brunner "}, "Noa Brunner"},
		{"no name uses the email", User{Email: "noa.brunner@example.ch"}, "noa.brunner"},
		{"blank name uses the email", User{Email: "noa@example.ch", Name: "  "}, "noa"},
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
