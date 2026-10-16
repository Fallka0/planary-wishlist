package app

import (
	"context"

	"planary-wishlist/pkg/auth"
	"planary-wishlist/pkg/db"
)

// UpsertProfile stores the caller's email and display name. It only writes when something changed.
func UpsertProfile(ctx context.Context, user auth.User) error {
	pool, err := db.Pool(ctx)
	if err != nil {
		return err
	}

	_, err = pool.Exec(ctx, `
INSERT INTO profiles (user_id, email, display_name)
VALUES ($1, $2, $3)
ON CONFLICT (user_id) DO UPDATE
SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, updated_at = NOW()
WHERE profiles.email IS DISTINCT FROM EXCLUDED.email
   OR profiles.display_name IS DISTINCT FROM EXCLUDED.display_name`,
		user.ID, user.Email, auth.DisplayName(user))
	return err
}
