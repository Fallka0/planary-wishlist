package db

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	"regexp"
	"slices"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestMigrationsAreOrderedAndSelfContained(t *testing.T) {
	migrations, err := Migrations()
	if err != nil {
		t.Fatal(err)
	}
	var versions []string
	for _, m := range migrations {
		versions = append(versions, m.Version)
		// The runner owns the transaction; a COMMIT inside a file would end it early.
		if regexp.MustCompile(`(?im)^\s*(BEGIN|COMMIT|ROLLBACK)\s*;`).MatchString(m.SQL) {
			t.Errorf("%s manages its own transaction", m.Version)
		}
	}
	want := []string{"0001_initial", "0002_wishlist_v2"}
	if !slices.Equal(versions, want) {
		t.Fatalf("versions = %v, want %v", versions, want)
	}
}

// ── Integration tests: need DATABASE_URL_TEST with permission to create databases ──

// tempDB creates an empty database for one test and drops it afterwards.
func tempDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	base := os.Getenv("DATABASE_URL_TEST")
	if base == "" {
		t.Skip("DATABASE_URL_TEST is not set")
	}
	ctx := context.Background()

	admin, err := pgx.Connect(ctx, base)
	if err != nil {
		t.Fatal(err)
	}
	suffix := make([]byte, 6)
	_, _ = rand.Read(suffix)
	name := "wishlist_test_" + hex.EncodeToString(suffix)
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatal(err)
	}

	cfg, err := pgxpool.ParseConfig(base)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.Database = name
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		pool.Close()
		_, _ = admin.Exec(ctx, "DROP DATABASE IF EXISTS "+name+" WITH (FORCE)")
		_ = admin.Close(ctx)
	})
	return pool
}

func mustMigrate(t *testing.T, pool *pgxpool.Pool) []string {
	t.Helper()
	applied, err := Migrate(context.Background(), pool)
	if err != nil {
		t.Fatal(err)
	}
	return applied
}

func count(t *testing.T, pool *pgxpool.Pool, query string, args ...any) int {
	t.Helper()
	var n int
	if err := pool.QueryRow(context.Background(), query, args...).Scan(&n); err != nil {
		t.Fatalf("%s: %v", query, err)
	}
	return n
}

func TestMigrateFreshDatabase(t *testing.T) {
	pool := tempDB(t)

	if got := mustMigrate(t, pool); !slices.Equal(got, []string{"0001_initial", "0002_wishlist_v2"}) {
		t.Fatalf("applied %v", got)
	}
	for _, table := range []string{"profiles", "lists", "occasions", "items", "item_picks", "reservations", "list_members", "list_followers"} {
		if n := count(t, pool, "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = $1", table); n != 1 {
			t.Errorf("table %s missing", table)
		}
	}
	if got := mustMigrate(t, pool); len(got) != 0 {
		t.Fatalf("second run applied %v, want nothing", got)
	}
}

func TestMigrateLegacyDatabase(t *testing.T) {
	pool := tempDB(t)
	ctx := context.Background()

	// The database as v1 left it: schema.sql ran on every cold start, no schema_migrations table.
	migrations, err := Migrations()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, migrations[0].SQL, pgx.QueryExecModeSimpleProtocol); err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(ctx, `
INSERT INTO users (id, email, password_hash) VALUES (1, 'old@example.ch', 'x');
INSERT INTO wishlists (id, user_id, title) VALUES (1, 1, 'Pre-Supabase list');
INSERT INTO wishlists (id, auth_user_id, title) VALUES (2, '11111111-1111-1111-1111-111111111111', '  ');
INSERT INTO wishlist_items (wishlist_id, name, url, notes, price_cents, priority, reserved) VALUES
  (1, 'Not migrated', 'https://example.ch', '', 100, 2, FALSE),
  (2, 'Headphones', 'https://www.Galaxus.ch:443/en/s1/product/123?ref=x', 'black', 34900, 1, TRUE),
  (2, 'Mug', 'http://shop.example.com/mug#top', '', 1500, 9, FALSE),
  (2, '   ', 'https://example.ch', '', 0, 2, FALSE);`)
	if err != nil {
		t.Fatal(err)
	}

	if got := mustMigrate(t, pool); !slices.Equal(got, []string{"0001_initial", "0002_wishlist_v2"}) {
		t.Fatalf("applied %v", got)
	}

	if n := count(t, pool, "SELECT COUNT(*) FROM lists"); n != 1 {
		t.Fatalf("lists = %d, want 1 (only the Supabase-owned wishlist)", n)
	}
	var title, owner string
	if err := pool.QueryRow(ctx, "SELECT title, owner_id::text FROM lists").Scan(&title, &owner); err != nil {
		t.Fatal(err)
	}
	if title != "My Wishlist" || owner != "11111111-1111-1111-1111-111111111111" {
		t.Fatalf("list = %q owned by %s", title, owner)
	}

	rows, err := pool.Query(ctx, "SELECT name, store, priority FROM items ORDER BY name")
	if err != nil {
		t.Fatal(err)
	}
	type item struct {
		name, store string
		priority    int
	}
	got, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (item, error) {
		var it item
		err := row.Scan(&it.name, &it.store, &it.priority)
		return it, err
	})
	if err != nil {
		t.Fatal(err)
	}
	want := []item{{"Headphones", "galaxus.ch", 1}, {"Mug", "shop.example.com", 3}}
	if !slices.Equal(got, want) {
		t.Fatalf("items = %+v, want %+v (blank name skipped, priority clamped)", got, want)
	}
	if n := count(t, pool, "SELECT COUNT(*) FROM reservations r JOIN items i ON i.id = r.item_id WHERE i.name = 'Headphones' AND r.source = 'legacy'"); n != 1 {
		t.Fatal("the reserved legacy item has no legacy reservation")
	}

	// Re-running changes nothing, even if 0002 itself were run again.
	if got := mustMigrate(t, pool); len(got) != 0 {
		t.Fatalf("second run applied %v", got)
	}
	if _, err := pool.Exec(ctx, migrations[1].SQL, pgx.QueryExecModeSimpleProtocol); err != nil {
		t.Fatal(err)
	}
	if n := count(t, pool, "SELECT (SELECT COUNT(*) FROM lists) + (SELECT COUNT(*) FROM items) + (SELECT COUNT(*) FROM reservations)"); n != 4 {
		t.Fatalf("rows after re-running 0002 = %d, want 4", n)
	}
}

func TestMigrateConcurrentColdStarts(t *testing.T) {
	pool := tempDB(t)

	var wg sync.WaitGroup
	errs := make(chan error, 4)
	for range 4 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := Migrate(context.Background(), pool)
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if n := count(t, pool, "SELECT COUNT(*) FROM schema_migrations"); n != 2 {
		t.Fatalf("schema_migrations rows = %d, want 2", n)
	}
}
