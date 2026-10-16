// Package dbtest makes throwaway Postgres databases for integration tests.
package dbtest

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/url"

	"github.com/jackc/pgx/v5"
)

// Create makes an empty database next to baseURL's and returns its URL and a function that drops it.
// baseURL must be a postgres:// URL whose user has CREATEDB.
func Create(ctx context.Context, baseURL string) (string, func(), error) {
	admin, err := pgx.Connect(ctx, baseURL)
	if err != nil {
		return "", nil, err
	}
	suffix := make([]byte, 6)
	_, _ = rand.Read(suffix)
	name := "wishlist_test_" + hex.EncodeToString(suffix)
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		_ = admin.Close(ctx)
		return "", nil, err
	}
	u, err := url.Parse(baseURL) // DATABASE_URL_TEST is a postgres:// URL
	if err != nil {
		_ = admin.Close(ctx)
		return "", nil, err
	}
	u.Path = "/" + name
	drop := func() {
		_, _ = admin.Exec(context.Background(), "DROP DATABASE IF EXISTS "+name+" WITH (FORCE)")
		_ = admin.Close(context.Background())
	}
	return u.String(), drop, nil
}
