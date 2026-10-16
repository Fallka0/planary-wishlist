package app

import (
	"context"
	"strings"
	"unicode/utf8"

	"planary-wishlist/pkg/db"
	"planary-wishlist/pkg/models"
)

// Search finds lists (by title or the person's full name) and items (by name) the user owns or plans.
// Lists shared with the user aren't searched.
func Search(ctx context.Context, userID, q string) (models.SearchResponse, error) {
	out := models.SearchResponse{Lists: []models.SearchList{}, Items: []models.SearchItem{}}
	q = strings.TrimSpace(q)
	if utf8.RuneCountInString(q) < 2 {
		return out, invalid("Type at least two letters.")
	}
	if utf8.RuneCountInString(q) > 100 {
		q = truncateRunes(q, 100)
	}
	pattern := "%" + strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(q) + "%"

	pool, err := db.Pool(ctx)
	if err != nil {
		return out, err
	}
	rows, err := pool.Query(ctx, `
SELECT l.id, l.kind, l.title
FROM lists l
WHERE `+canSeeList+` AND (l.title ILIKE $1 OR l.person_full_name ILIKE $1)
ORDER BY l.title, l.id
LIMIT 5`, pattern, userID)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var l models.SearchList
		if err := rows.Scan(&l.ID, &l.Kind, &l.Title); err != nil {
			rows.Close()
			return out, err
		}
		out.Lists = append(out.Lists, l)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return out, err
	}

	rows, err = pool.Query(ctx, `
SELECT i.id, l.id, l.kind, l.title, i.name
FROM items i
JOIN lists l ON l.id = i.list_id
WHERE `+canSeeList+` AND i.name ILIKE $1
ORDER BY i.created_at DESC, i.id DESC
LIMIT 10`, pattern, userID)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var it models.SearchItem
		if err := rows.Scan(&it.ID, &it.ListID, &it.ListKind, &it.ListTitle, &it.Name); err != nil {
			return out, err
		}
		out.Items = append(out.Items, it)
	}
	return out, rows.Err()
}
