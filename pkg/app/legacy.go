package app

import (
	"context"
	"errors"
	"strings"

	"planary-wishlist/pkg/db"
	"planary-wishlist/pkg/models"

	"github.com/jackc/pgx/v5"
)

func EnsureWishlist(ctx context.Context, authUserID string) (models.Wishlist, error) {
	pool, err := db.Pool(ctx)
	if err != nil {
		return models.Wishlist{}, err
	}

	authUserID = strings.TrimSpace(authUserID)
	if authUserID == "" {
		return models.Wishlist{}, errors.New("auth user id is required")
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO wishlists (auth_user_id, title)
		SELECT $1::uuid, 'My Wishlist'
		WHERE NOT EXISTS (
			SELECT 1
			FROM wishlists
			WHERE auth_user_id = $1::uuid
		)
	`, authUserID)
	if err != nil {
		return models.Wishlist{}, err
	}

	var wishlist models.Wishlist
	err = pool.QueryRow(ctx, `
		SELECT id, auth_user_id::text, title, created_at
		FROM wishlists
		WHERE auth_user_id = $1::uuid
	`, authUserID).Scan(&wishlist.ID, &wishlist.AuthUserID, &wishlist.Title, &wishlist.CreatedAt)
	return wishlist, err
}

func GetWishlist(ctx context.Context, authUserID string) (models.Wishlist, error) {
	wishlist, err := EnsureWishlist(ctx, authUserID)
	if err != nil {
		return models.Wishlist{}, err
	}

	pool, err := db.Pool(ctx)
	if err != nil {
		return models.Wishlist{}, err
	}

	rows, err := pool.Query(ctx, `
		SELECT id, wishlist_id, name, url, image_url, notes, price_cents, priority, reserved, created_at
		FROM wishlist_items
		WHERE wishlist_id = $1
		ORDER BY created_at DESC
	`, wishlist.ID)
	if err != nil {
		return models.Wishlist{}, err
	}
	defer rows.Close()

	items := make([]models.WishlistItem, 0)
	for rows.Next() {
		var item models.WishlistItem
		if err := rows.Scan(
			&item.ID,
			&item.WishlistID,
			&item.Name,
			&item.URL,
			&item.ImageURL,
			&item.Notes,
			&item.PriceCents,
			&item.Priority,
			&item.Reserved,
			&item.CreatedAt,
		); err != nil {
			return models.Wishlist{}, err
		}
		items = append(items, item)
	}

	wishlist.Items = items
	return wishlist, rows.Err()
}

func CreateWishlistItem(ctx context.Context, authUserID string, item models.WishlistItem) (models.WishlistItem, error) {
	wishlist, err := EnsureWishlist(ctx, authUserID)
	if err != nil {
		return models.WishlistItem{}, err
	}

	item.URL = strings.TrimSpace(item.URL)
	name := strings.TrimSpace(item.Name)

	if item.URL != "" {
		if metadata, err := fetchLinkMetadata(ctx, item.URL); err == nil {
			if name == "" {
				name = metadata.Title
			}
			if item.ImageURL == "" {
				item.ImageURL = metadata.ImageURL
			}
			if item.PriceCents <= 0 {
				item.PriceCents = metadata.PriceCents
			}
			item.URL = firstNonEmpty(normalizeURLOrEmpty(item.URL), item.URL)
		}
	}

	if name == "" {
		return models.WishlistItem{}, errors.New("product name is required unless we can infer it from the link")
	}

	if item.Priority < 1 || item.Priority > 3 {
		item.Priority = 2
	}

	pool, err := db.Pool(ctx)
	if err != nil {
		return models.WishlistItem{}, err
	}

	var created models.WishlistItem
	err = pool.QueryRow(ctx, `
		INSERT INTO wishlist_items (wishlist_id, name, url, image_url, notes, price_cents, priority, reserved)
		VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
		RETURNING id, wishlist_id, name, url, image_url, notes, price_cents, priority, reserved, created_at
	`, wishlist.ID, name, item.URL, strings.TrimSpace(item.ImageURL), strings.TrimSpace(item.Notes), item.PriceCents, item.Priority).
		Scan(
			&created.ID,
			&created.WishlistID,
			&created.Name,
			&created.URL,
			&created.ImageURL,
			&created.Notes,
			&created.PriceCents,
			&created.Priority,
			&created.Reserved,
			&created.CreatedAt,
		)

	return created, err
}

func UpdateWishlistItemReservation(ctx context.Context, authUserID string, itemID int64, reserved bool) (models.WishlistItem, error) {
	wishlist, err := EnsureWishlist(ctx, authUserID)
	if err != nil {
		return models.WishlistItem{}, err
	}

	pool, err := db.Pool(ctx)
	if err != nil {
		return models.WishlistItem{}, err
	}

	var updated models.WishlistItem
	err = pool.QueryRow(ctx, `
		UPDATE wishlist_items
		SET reserved = $1
		WHERE id = $2 AND wishlist_id = $3
		RETURNING id, wishlist_id, name, url, image_url, notes, price_cents, priority, reserved, created_at
	`, reserved, itemID, wishlist.ID).Scan(
		&updated.ID,
		&updated.WishlistID,
		&updated.Name,
		&updated.URL,
		&updated.ImageURL,
		&updated.Notes,
		&updated.PriceCents,
		&updated.Priority,
		&updated.Reserved,
		&updated.CreatedAt,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return models.WishlistItem{}, errors.New("wishlist item not found")
	}

	return updated, err
}

func DeleteWishlistItem(ctx context.Context, authUserID string, itemID int64) error {
	wishlist, err := EnsureWishlist(ctx, authUserID)
	if err != nil {
		return err
	}

	pool, err := db.Pool(ctx)
	if err != nil {
		return err
	}

	commandTag, err := pool.Exec(ctx, `
		DELETE FROM wishlist_items
		WHERE id = $1 AND wishlist_id = $2
	`, itemID, wishlist.ID)
	if err != nil {
		return err
	}
	if commandTag.RowsAffected() == 0 {
		return errors.New("wishlist item not found")
	}
	return nil
}

func normalizeURLOrEmpty(rawURL string) string {
	normalizedURL, err := normalizeLinkURL(rawURL)
	if err != nil {
		return ""
	}
	return normalizedURL
}
