package app

import (
	"context"
	"strings"
	"unicode"

	"planary-wishlist/pkg/auth"
	"planary-wishlist/pkg/models"
)

// Initials are two letters for avatars: the first letters of the first two words of the name,
// or the first two letters of a one-word name. "Noa Brunner" → "NB", "noa.brunner" → "NB", "Lea" → "LE".
func Initials(name string) string {
	words := strings.FieldsFunc(name, func(r rune) bool {
		return unicode.IsSpace(r) || r == '.' || r == '_' || r == '-' || r == '@'
	})
	var letters []rune
	switch {
	case len(words) >= 2:
		letters = []rune{[]rune(words[0])[0], []rune(words[1])[0]}
	case len(words) == 1:
		r := []rune(words[0])
		letters = r[:min(2, len(r))]
	default:
		return "?"
	}
	return strings.ToUpper(string(letters))
}

func profileFor(user auth.User) models.Profile {
	name := auth.DisplayName(user)
	return models.Profile{ID: user.ID, Email: user.Email, DisplayName: name, Initials: Initials(name)}
}

// Me is the signed-in user's profile.
func Me(user auth.User) models.Profile { return profileFor(user) }

func personRef(id, name, me string) models.PersonRef {
	if strings.TrimSpace(name) == "" {
		name = "Someone"
	}
	return models.PersonRef{ID: id, Name: name, Initials: Initials(name), IsMe: id == me}
}

// people looks up display names for user ids. Ids without a profile come back as "Someone".
func people(ctx context.Context, q querier, ids []string, me string) (map[string]models.PersonRef, error) {
	out := make(map[string]models.PersonRef, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := q.Query(ctx, `SELECT user_id::text, display_name FROM profiles WHERE user_id = ANY($1::uuid[])`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		out[id] = personRef(id, name, me)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for _, id := range ids {
		if _, ok := out[id]; !ok {
			out[id] = personRef(id, "", me)
		}
	}
	return out, nil
}
