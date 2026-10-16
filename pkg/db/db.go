package db

import (
	"context"
	"errors"
	"os"
	"sync"

	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	pool    *pgxpool.Pool
	initErr error
	once    sync.Once
)

// Pool returns the shared connection pool. The first call connects and applies any pending migrations.
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

		if _, err = Migrate(ctx, pool); err != nil {
			initErr = err
			return
		}
	})

	return pool, initErr
}
