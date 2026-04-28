package db

import (
	"context"
	"embed"
	"errors"
	"os"
	"sync"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed schema.sql
var schemaFS embed.FS

var (
	pool    *pgxpool.Pool
	initErr error
	once    sync.Once
)

func Pool(ctx context.Context) (*pgxpool.Pool, error) {
	once.Do(func() {
		databaseURL := os.Getenv("DATABASE_URL")
		if databaseURL == "" {
			initErr = errors.New("DATABASE_URL is required")
			return
		}

		var err error
		pool, err = pgxpool.New(ctx, databaseURL)
		if err != nil {
			initErr = err
			return
		}

		if err = pool.Ping(ctx); err != nil {
			initErr = err
			return
		}

		if err = ensureSchema(ctx, pool); err != nil {
			initErr = err
			return
		}
	})

	return pool, initErr
}

func ensureSchema(ctx context.Context, pool *pgxpool.Pool) error {
	schema, err := schemaFS.ReadFile("schema.sql")
	if err != nil {
		return err
	}

	_, err = pool.Exec(ctx, string(schema))
	return err
}
