package db

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Any constant works; it only has to be the same for every instance of this app.
const migrationLockKey = 727273

// Migration is one embedded SQL file. Version is the file name without ".sql", e.g. "0002_wishlist_v2".
type Migration struct {
	Version string
	SQL     string
}

// Migrations returns the embedded migrations in the order they must run.
func Migrations() ([]Migration, error) {
	names, err := fs.Glob(migrationsFS, "migrations/*.sql")
	if err != nil {
		return nil, err
	}
	sort.Strings(names)

	migrations := make([]Migration, 0, len(names))
	for _, name := range names {
		body, err := migrationsFS.ReadFile(name)
		if err != nil {
			return nil, err
		}
		version := strings.TrimSuffix(strings.TrimPrefix(name, "migrations/"), ".sql")
		migrations = append(migrations, Migration{Version: version, SQL: string(body)})
	}
	return migrations, nil
}

// Migrate applies every embedded migration that isn't recorded in schema_migrations yet, in order.
// Each file runs in its own transaction behind an advisory lock, so parallel cold starts
// apply it once and a failing file leaves nothing half done. Returns the versions it applied.
func Migrate(ctx context.Context, pool *pgxpool.Pool) ([]string, error) {
	migrations, err := Migrations()
	if err != nil {
		return nil, err
	}

	var applied []string
	for _, m := range migrations {
		ran, err := apply(ctx, pool, m)
		if err != nil {
			return applied, fmt.Errorf("migration %s: %w", m.Version, err)
		}
		if ran {
			applied = append(applied, m.Version)
		}
	}
	return applied, nil
}

func apply(ctx context.Context, pool *pgxpool.Pool, m Migration) (bool, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after Commit

	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", migrationLockKey); err != nil {
		return false, err
	}
	if _, err := tx.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`); err != nil {
		return false, err
	}

	var done bool
	if err := tx.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)", m.Version).Scan(&done); err != nil {
		return false, err
	}
	if done {
		return false, tx.Commit(ctx)
	}

	// Simple protocol so a file can hold several statements.
	if _, err := tx.Exec(ctx, m.SQL, pgx.QueryExecModeSimpleProtocol); err != nil {
		return false, err
	}
	if _, err := tx.Exec(ctx, "INSERT INTO schema_migrations (version) VALUES ($1)", m.Version); err != nil {
		return false, err
	}
	return true, tx.Commit(ctx)
}
