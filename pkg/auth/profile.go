package auth

import "strings"

// DisplayName is the name shown for a user ("Noa Brunner's wishlist", "Lea is getting this").
// Planary accounts don't agree on one metadata key, so try the common ones, then the email's local part.
func DisplayName(u User) string {
	for _, key := range []string{"display_name", "full_name", "name"} {
		if value, ok := u.UserMetadata[key].(string); ok {
			if name := strings.TrimSpace(value); name != "" {
				return name
			}
		}
	}
	local, _, _ := strings.Cut(u.Email, "@")
	return strings.TrimSpace(local)
}
