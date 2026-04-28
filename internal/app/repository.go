package app

import (
	"context"
	"errors"
	"strings"

	"planary-wishlist/internal/db"
	"planary-wishlist/internal/models"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

var ErrInvalidCredentials = errors.New("invalid email or password")

func CreateUser(ctx context.Context, email, password string) (models.User, error) {
	pool, err := db.Pool(ctx)
	if err != nil {
		return models.User{}, err
	}

	email = normalizeEmail(email)
	if len(password) < 8 {
		return models.User{}, errors.New("password must be at least 8 characters")
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return models.User{}, err
	}

	var user models.User
	err = pool.QueryRow(ctx, `
		INSERT INTO users (email, password_hash)
		VALUES ($1, $2)
		RETURNING id, email, created_at
	`, email, string(passwordHash)).Scan(&user.ID, &user.Email, &user.CreatedAt)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			return models.User{}, errors.New("an account with that email already exists")
		}
		return models.User{}, err
	}

	if _, err := EnsureWishlist(ctx, user.ID); err != nil {
		return models.User{}, err
	}

	return user, nil
}

func AuthenticateUser(ctx context.Context, email, password string) (models.User, error) {
	pool, err := db.Pool(ctx)
	if err != nil {
		return models.User{}, err
	}

	var (
		user         models.User
		passwordHash string
	)

	err = pool.QueryRow(ctx, `
		SELECT id, email, password_hash, created_at
		FROM users
		WHERE email = $1
	`, normalizeEmail(email)).Scan(&user.ID, &user.Email, &passwordHash, &user.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.User{}, ErrInvalidCredentials
		}
		return models.User{}, err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(password)); err != nil {
		return models.User{}, ErrInvalidCredentials
	}

	if _, err := EnsureWishlist(ctx, user.ID); err != nil {
		return models.User{}, err
	}

	return user, nil
}

func GetUserByID(ctx context.Context, userID int64) (models.User, error) {
	pool, err := db.Pool(ctx)
	if err != nil {
		return models.User{}, err
	}

	var user models.User
	err = pool.QueryRow(ctx, `
		SELECT id, email, created_at
		FROM users
		WHERE id = $1
	`, userID).Scan(&user.ID, &user.Email, &user.CreatedAt)
	return user, err
}

func EnsureWishlist(ctx context.Context, userID int64) (models.Wishlist, error) {
	pool, err := db.Pool(ctx)
	if err != nil {
		return models.Wishlist{}, err
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO wishlists (user_id, title)
		VALUES ($1, 'My Wishlist')
		ON CONFLICT (user_id) DO NOTHING
	`, userID)
	if err != nil {
		return models.Wishlist{}, err
	}

	var wishlist models.Wishlist
	err = pool.QueryRow(ctx, `
		SELECT id, user_id, title, created_at
		FROM wishlists
		WHERE user_id = $1
	`, userID).Scan(&wishlist.ID, &wishlist.UserID, &wishlist.Title, &wishlist.CreatedAt)
	return wishlist, err
}

func GetWishlist(ctx context.Context, userID int64) (models.Wishlist, error) {
	wishlist, err := EnsureWishlist(ctx, userID)
	if err != nil {
		return models.Wishlist{}, err
	}

	pool, err := db.Pool(ctx)
	if err != nil {
		return models.Wishlist{}, err
	}

	rows, err := pool.Query(ctx, `
		SELECT id, wishlist_id, name, url, notes, price_cents, priority, reserved, created_at
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

func CreateWishlistItem(ctx context.Context, userID int64, item models.WishlistItem) (models.WishlistItem, error) {
	wishlist, err := EnsureWishlist(ctx, userID)
	if err != nil {
		return models.WishlistItem{}, err
	}

	name := strings.TrimSpace(item.Name)
	if name == "" {
		return models.WishlistItem{}, errors.New("product name is required")
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
		INSERT INTO wishlist_items (wishlist_id, name, url, notes, price_cents, priority, reserved)
		VALUES ($1, $2, $3, $4, $5, $6, FALSE)
		RETURNING id, wishlist_id, name, url, notes, price_cents, priority, reserved, created_at
	`, wishlist.ID, name, strings.TrimSpace(item.URL), strings.TrimSpace(item.Notes), item.PriceCents, item.Priority).
		Scan(
			&created.ID,
			&created.WishlistID,
			&created.Name,
			&created.URL,
			&created.Notes,
			&created.PriceCents,
			&created.Priority,
			&created.Reserved,
			&created.CreatedAt,
		)

	return created, err
}

func UpdateWishlistItemReservation(ctx context.Context, userID, itemID int64, reserved bool) (models.WishlistItem, error) {
	wishlist, err := EnsureWishlist(ctx, userID)
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
		RETURNING id, wishlist_id, name, url, notes, price_cents, priority, reserved, created_at
	`, reserved, itemID, wishlist.ID).Scan(
		&updated.ID,
		&updated.WishlistID,
		&updated.Name,
		&updated.URL,
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

func DeleteWishlistItem(ctx context.Context, userID, itemID int64) error {
	wishlist, err := EnsureWishlist(ctx, userID)
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

func normalizeEmail(email string) string {
	return strings.TrimSpace(strings.ToLower(email))
}
