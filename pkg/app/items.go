package app

import (
	"context"
	"strings"
	"unicode/utf8"

	"planary-wishlist/pkg/db"
	"planary-wishlist/pkg/models"
)

// ItemInput is the body of POST and PATCH /api/items. Nil fields stay unchanged on PATCH.
// Creating an item never fetches the URL: the client fills the fields from /api/link-preview.
type ItemInput struct {
	ListID     int64   `json:"listId"`
	Name       *string `json:"name"`
	URL        *string `json:"url"`
	ImageURL   *string `json:"imageUrl"`
	Store      *string `json:"store"`
	Note       *string `json:"note"`
	PriceCents *int64  `json:"priceCents"`
	Currency   *string `json:"currency"`
	Priority   *int    `json:"priority"`
}

type itemFields struct {
	name, url, imageURL, store, note, currency string
	priceCents                                 int64
	priority                                   int
}

// apply merges the input into f and validates the result.
func (f *itemFields) apply(in ItemInput, kind string) error {
	urlChanged := false
	if in.Name != nil {
		f.name = strings.Join(strings.Fields(*in.Name), " ")
	}
	if in.URL != nil {
		u, err := cleanWebURL(*in.URL, "The link")
		if err != nil {
			return err
		}
		urlChanged = u != f.url
		f.url = u
	}
	if in.ImageURL != nil {
		u, err := cleanWebURL(*in.ImageURL, "The picture")
		if err != nil {
			return err
		}
		f.imageURL = u
	}
	switch {
	case in.Store != nil && strings.TrimSpace(*in.Store) != "":
		f.store = strings.ToLower(truncateRunes(strings.TrimSpace(*in.Store), 100))
	case in.Store != nil || urlChanged:
		f.store = StoreFromURL(f.url)
	}
	if in.Note != nil {
		f.note = strings.TrimSpace(*in.Note)
	}
	if in.PriceCents != nil {
		f.priceCents = *in.PriceCents
	}
	if in.Currency != nil {
		f.currency = strings.ToUpper(strings.TrimSpace(*in.Currency))
	}
	if in.Priority != nil && kind == KindWish {
		f.priority = *in.Priority
	}
	if kind == KindPerson {
		f.priority = 2 // unused on person lists
	}

	switch {
	case f.name == "":
		return invalid("Give it a name so you recognise it later.")
	case utf8.RuneCountInString(f.name) > 200:
		return invalid("Keep the name under 200 characters.")
	case utf8.RuneCountInString(f.note) > 500:
		return invalid("Keep the note under 500 characters.")
	case f.priceCents < 0 || f.priceCents > 100_000_000_00:
		return invalid("That price doesn't look right.")
	case currencyCode(f.currency) == "":
		return invalid("Use a three-letter currency code, like CHF.")
	case f.priority < 1 || f.priority > 3:
		return invalid("Pick must have, would love or nice to have.")
	}
	return nil
}

// CreateItem adds an item to a wishlist (owner) or an idea to a person list (owner or co-planner).
func CreateItem(ctx context.Context, userID string, in ItemInput) (any, error) {
	pool, err := db.Pool(ctx)
	if err != nil {
		return nil, err
	}
	a, err := listAccess(ctx, pool, in.ListID, userID)
	if err != nil {
		return nil, err
	}
	if a.Kind == KindWish && !a.isOwner() {
		return nil, errNotFound
	}
	f := itemFields{currency: "CHF", priority: 2}
	if err := f.apply(in, a.Kind); err != nil {
		return nil, err
	}
	var id int64
	err = pool.QueryRow(ctx, `
INSERT INTO items (list_id, name, url, image_url, store, note, price_cents, currency, priority, added_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING id`, a.ListID, f.name, f.url, f.imageURL, f.store, f.note, f.priceCents, f.currency, f.priority, userID).Scan(&id)
	if err != nil {
		return nil, err
	}
	return loadItem(ctx, pool, a, id, userID)
}

// canChangeItem: owners change anything on their list; co-planners only the ideas they added.
func canChangeItem(a access, addedBy *string, userID string) error {
	if a.Kind == KindWish && !a.isOwner() {
		return errNotFound
	}
	if a.isOwner() || (addedBy != nil && *addedBy == userID) {
		return nil
	}
	return forbidden("You can only change ideas you added.")
}

// UpdateItem edits an item. Fields left out stay as they are.
func UpdateItem(ctx context.Context, userID string, itemID int64, in ItemInput) (any, error) {
	pool, err := db.Pool(ctx)
	if err != nil {
		return nil, err
	}
	a, addedBy, err := itemAccess(ctx, pool, itemID, userID)
	if err != nil {
		return nil, err
	}
	if err := canChangeItem(a, addedBy, userID); err != nil {
		return nil, err
	}
	var f itemFields
	if err := pool.QueryRow(ctx, `
SELECT name, url, image_url, store, note, price_cents, currency, priority FROM items WHERE id = $1`, itemID).
		Scan(&f.name, &f.url, &f.imageURL, &f.store, &f.note, &f.priceCents, &f.currency, &f.priority); err != nil {
		return nil, err
	}
	if err := f.apply(in, a.Kind); err != nil {
		return nil, err
	}
	if _, err := pool.Exec(ctx, `
UPDATE items SET name = $2, url = $3, image_url = $4, store = $5, note = $6, price_cents = $7, currency = $8,
  priority = $9, updated_at = NOW()
WHERE id = $1`, itemID, f.name, f.url, f.imageURL, f.store, f.note, f.priceCents, f.currency, f.priority); err != nil {
		return nil, err
	}
	return loadItem(ctx, pool, a, itemID, userID)
}

// DeleteItem removes an item, with its picks and any reservation.
func DeleteItem(ctx context.Context, userID string, itemID int64) error {
	pool, err := db.Pool(ctx)
	if err != nil {
		return err
	}
	a, addedBy, err := itemAccess(ctx, pool, itemID, userID)
	if err != nil {
		return err
	}
	if err := canChangeItem(a, addedBy, userID); err != nil {
		return err
	}
	_, err = pool.Exec(ctx, "DELETE FROM items WHERE id = $1", itemID)
	return err
}

// loadItem returns a WishItem on a wishlist or an Idea on a person list.
func loadItem(ctx context.Context, q querier, a access, itemID int64, userID string) (any, error) {
	if a.Kind == KindWish {
		items, err := wishItems(ctx, q, a.ListID, itemID)
		if err != nil || len(items) == 0 {
			return nil, firstErr(err, errNotFound)
		}
		return items[0], nil
	}
	ideas, err := loadIdeas(ctx, q, a.ListID, itemID, userID)
	if err != nil || len(ideas) == 0 {
		return nil, firstErr(err, errNotFound)
	}
	return ideas[0], nil
}

func firstErr(errs ...error) error {
	for _, err := range errs {
		if err != nil {
			return err
		}
	}
	return nil
}

const itemOrder = " ORDER BY i.position, i.created_at DESC, i.id DESC"

// wishItems loads the items of a wishlist (all of them, or one when itemID isn't 0).
// It reads the items table only: nothing about reservations can reach the owner from here.
func wishItems(ctx context.Context, q querier, listID, itemID int64) ([]models.WishItem, error) {
	rows, err := q.Query(ctx, `
SELECT i.id, i.list_id, i.name, i.url, i.image_url, i.store, i.note, i.price_cents, i.currency, i.priority, i.created_at
FROM items i
WHERE i.list_id = $1 AND ($2 = 0 OR i.id = $2)`+itemOrder, listID, itemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []models.WishItem{}
	for rows.Next() {
		var it models.WishItem
		if err := rows.Scan(&it.ID, &it.ListID, &it.Name, &it.URL, &it.ImageURL, &it.Store, &it.Note,
			&it.PriceCents, &it.Currency, &it.Priority, &it.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, it)
	}
	return items, rows.Err()
}

// loadIdeas loads the ideas of a person list with who added them, who's getting them and their picks.
func loadIdeas(ctx context.Context, q querier, listID, itemID int64, me string) ([]models.Idea, error) {
	rows, err := q.Query(ctx, `
SELECT i.id, i.list_id, i.name, i.url, i.image_url, i.store, i.note, i.price_cents, i.currency, i.created_at,
  COALESCE(i.added_by::text, ''), r.item_id IS NOT NULL, COALESCE(r.user_id::text, ''),
  ARRAY(SELECT p.occasion_id FROM item_picks p WHERE p.item_id = i.id ORDER BY p.occasion_id)
FROM items i
JOIN lists l ON l.id = i.list_id AND l.kind = 'person'
LEFT JOIN reservations r ON r.item_id = i.id
WHERE i.list_id = $1 AND ($2 = 0 OR i.id = $2)`+itemOrder, listID, itemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type row struct {
		idea       models.Idea
		addedBy    string
		reserved   bool
		reservedBy string
	}
	var loaded []row
	var ids []string
	for rows.Next() {
		var r row
		it := &r.idea
		if err := rows.Scan(&it.ID, &it.ListID, &it.Name, &it.URL, &it.ImageURL, &it.Store, &it.Note,
			&it.PriceCents, &it.Currency, &it.CreatedAt, &r.addedBy, &r.reserved, &r.reservedBy, &it.PickedFor); err != nil {
			return nil, err
		}
		if it.PickedFor == nil {
			it.PickedFor = []int64{}
		}
		loaded = append(loaded, r)
		for _, id := range []string{r.addedBy, r.reservedBy} {
			if id != "" {
				ids = append(ids, id)
			}
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	refs, err := people(ctx, q, ids, me)
	if err != nil {
		return nil, err
	}
	ideas := make([]models.Idea, 0, len(loaded))
	for _, r := range loaded {
		r.idea.AddedBy = refs[r.addedBy]
		if r.addedBy == "" {
			r.idea.AddedBy = personRef("", "", me)
		}
		if r.reserved {
			ref := refs[r.reservedBy]
			if r.reservedBy == "" {
				ref = personRef("", "", me)
			}
			r.idea.ReservedBy = &ref
		}
		ideas = append(ideas, r.idea)
	}
	return ideas, nil
}
