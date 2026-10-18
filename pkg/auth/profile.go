package auth

import "strings"

// DisplayName is the name shown for a user ("Noa Brunner's wishlist", "Lea is getting this"):
// the Planary account name, else the email's local part.
func DisplayName(u User) string {
	if name := strings.Join(strings.Fields(u.Name), " "); name != "" {
		return name
	}
	local, _, _ := strings.Cut(u.Email, "@")
	return strings.TrimSpace(local)
}
