package app

import (
	"context"
	"errors"
	"log"
	"strings"
	"sync"
	"time"

	"planary-wishlist/pkg/db"
	mailer "planary-wishlist/pkg/mail"
	"planary-wishlist/pkg/models"

	"github.com/jackc/pgx/v5"
)

// ── Sharing (wishlist owners) ──

func wishOwnerAccess(ctx context.Context, q querier, listID int64, userID string) (access, error) {
	a, err := listAccess(ctx, q, listID, userID)
	if err != nil {
		return access{}, err
	}
	if a.Kind != KindWish || !a.isOwner() {
		return access{}, errNotFound
	}
	return a, nil
}

// SetSharing turns a wishlist's link on or off. The first time creates the token; turning it off
// keeps the token, so turning it back on brings the same link back.
func SetSharing(ctx context.Context, userID string, listID int64, enabled bool, baseURL string) (models.ShareState, error) {
	pool, err := db.Pool(ctx)
	if err != nil {
		return models.ShareState{}, err
	}
	if _, err := wishOwnerAccess(ctx, pool, listID, userID); err != nil {
		return models.ShareState{}, err
	}
	var token *string
	err = pool.QueryRow(ctx, `
UPDATE lists SET share_enabled = $2, share_token = COALESCE(share_token, $3), updated_at = NOW()
WHERE id = $1 RETURNING share_token`, listID, enabled, newShareToken()).Scan(&token)
	if err != nil {
		return models.ShareState{}, err
	}
	return shareState(enabled, token, baseURL), nil
}

// RotateShareLink replaces the token. Old links stop working (link_off).
func RotateShareLink(ctx context.Context, userID string, listID int64, baseURL string) (models.ShareState, error) {
	pool, err := db.Pool(ctx)
	if err != nil {
		return models.ShareState{}, err
	}
	if _, err := wishOwnerAccess(ctx, pool, listID, userID); err != nil {
		return models.ShareState{}, err
	}
	var enabled bool
	var token *string
	err = pool.QueryRow(ctx, `
UPDATE lists SET share_token = $2, updated_at = NOW() WHERE id = $1 RETURNING share_enabled, share_token`,
		listID, newShareToken()).Scan(&enabled, &token)
	if err != nil {
		return models.ShareState{}, err
	}
	return shareState(enabled, token, baseURL), nil
}

// ── Public page (/w/:token) ──

type sharedList struct {
	id      int64
	title   string
	ownerID string
}

// openSharedList resolves a share token. Unknown tokens and lists with sharing off are link_off.
func openSharedList(ctx context.Context, q querier, token string) (sharedList, error) {
	var l sharedList
	token = strings.TrimSpace(token)
	if token == "" {
		return l, errLinkOff
	}
	err := q.QueryRow(ctx, `
SELECT id, title, owner_id::text FROM lists WHERE share_token = $1 AND share_enabled AND kind = 'wish'`, token).
		Scan(&l.id, &l.title, &l.ownerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return l, errLinkOff
	}
	return l, err
}

// publicItems loads a shared list's items as a visitor sees them. viewerID is "" for guests.
// The list owner never gets here with reservations: PublicList answers them with statuses "hidden".
func publicItems(ctx context.Context, q querier, listID, itemID int64, viewerID string) ([]models.PublicItem, error) {
	rows, err := q.Query(ctx, `
SELECT i.id, i.name, i.url, i.image_url, i.store, i.note, i.price_cents, i.currency, i.priority,
  CASE WHEN r.item_id IS NULL THEN 'free'
       WHEN $3 <> '' AND r.user_id::text = $3 THEN 'mine'
       ELSE 'taken' END
FROM items i
LEFT JOIN reservations r ON r.item_id = i.id
WHERE i.list_id = $1 AND ($2 = 0 OR i.id = $2)`+itemOrder, listID, itemID, viewerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []models.PublicItem{}
	for rows.Next() {
		var it models.PublicItem
		if err := rows.Scan(&it.ID, &it.Name, &it.URL, &it.ImageURL, &it.Store, &it.Note, &it.PriceCents,
			&it.Currency, &it.Priority, &it.Status); err != nil {
			return nil, err
		}
		items = append(items, it)
	}
	return items, rows.Err()
}

// ownerItems is the owner's preview of their own link: the same items, every status "hidden",
// read from the items table only.
func ownerItems(ctx context.Context, q querier, listID int64) ([]models.PublicItem, error) {
	wish, err := wishItems(ctx, q, listID, 0)
	if err != nil {
		return nil, err
	}
	items := make([]models.PublicItem, 0, len(wish))
	for _, w := range wish {
		items = append(items, models.PublicItem{
			ID: w.ID, Name: w.Name, URL: w.URL, ImageURL: w.ImageURL, Store: w.Store, Note: w.Note,
			PriceCents: w.PriceCents, Currency: w.Currency, Priority: w.Priority, Status: models.StatusHidden,
		})
	}
	return items, nil
}

// PublicList is the shared page. viewerID is "" for guests. A signed-in visitor who isn't the owner
// is remembered as a follower, which puts the list under "Shared with me".
func PublicList(ctx context.Context, viewerID, token string) (models.PublicListResponse, error) {
	pool, err := db.Pool(ctx)
	if err != nil {
		return models.PublicListResponse{}, err
	}
	l, err := openSharedList(ctx, pool, token)
	if err != nil {
		return models.PublicListResponse{}, err
	}
	isOwner := viewerID != "" && viewerID == l.ownerID

	var items []models.PublicItem
	if isOwner {
		items, err = ownerItems(ctx, pool, l.id)
	} else {
		if viewerID != "" {
			if _, err := pool.Exec(ctx, `
INSERT INTO list_followers (list_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, l.id, viewerID); err != nil {
				return models.PublicListResponse{}, err
			}
		}
		items, err = publicItems(ctx, pool, l.id, 0, viewerID)
	}
	if err != nil {
		return models.PublicListResponse{}, err
	}
	occasions, err := loadOccasions(ctx, pool, []int64{l.id})
	if err != nil {
		return models.PublicListResponse{}, err
	}
	refs, err := people(ctx, pool, []string{l.ownerID}, viewerID)
	if err != nil {
		return models.PublicListResponse{}, err
	}
	return models.PublicListResponse{
		List: models.PublicList{
			Title:    l.title,
			Owner:    refs[l.ownerID],
			Occasion: firstOccasion(occasions[l.id]),
			Items:    items,
		},
		Viewer: models.Viewer{SignedIn: viewerID != "", IsOwner: isOwner},
	}, nil
}

// ReserveInput is the body of POST and DELETE /api/public/reserve.
type ReserveInput struct {
	Token     string `json:"token"`
	ItemID    int64  `json:"itemId"`
	Email     string `json:"email"`
	UndoToken string `json:"undoToken"`
}

// Reserve marks an item as taken for a visitor: with their account when signed in, else with an
// email and an undo token. The owner can never reserve on their own list.
func Reserve(ctx context.Context, viewerID string, in ReserveInput, ip, baseURL string) (models.ReserveResponse, error) {
	pool, err := db.Pool(ctx)
	if err != nil {
		return models.ReserveResponse{}, err
	}
	l, err := openSharedList(ctx, pool, in.Token)
	if err != nil {
		return models.ReserveResponse{}, err
	}
	// Checked before anything else, so the owner's request can't tell whether the item is taken.
	if viewerID != "" && viewerID == l.ownerID {
		return models.ReserveResponse{}, forbidden("This is your own list. Friends reserve here, you don't.")
	}
	var email, undo string
	if viewerID == "" {
		if email, err = cleanEmail(in.Email); err != nil {
			return models.ReserveResponse{}, err
		}
		undo = newSecretToken()
	}
	var exists bool
	if err := pool.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM items WHERE id = $1 AND list_id = $2)", in.ItemID, l.id).Scan(&exists); err != nil {
		return models.ReserveResponse{}, err
	}
	if !exists {
		return models.ReserveResponse{}, errNotFound
	}
	if !reserveLimiter.allow(ip, time.Now()) {
		return models.ReserveResponse{}, errRateLimited
	}

	var userArg, emailArg, hashArg any
	if viewerID != "" {
		userArg = viewerID
	} else {
		emailArg, hashArg = email, hashToken(undo)
	}
	tag, err := pool.Exec(ctx, `
INSERT INTO reservations (item_id, source, user_id, email, undo_token_hash) VALUES ($1, 'web', $2, $3, $4)
ON CONFLICT (item_id) DO NOTHING`, in.ItemID, userArg, emailArg, hashArg)
	if err != nil {
		return models.ReserveResponse{}, err
	}
	if tag.RowsAffected() == 0 {
		// Already reserved. A signed-in visitor reserving again just gets their own reservation back.
		items, err := publicItems(ctx, pool, l.id, in.ItemID, viewerID)
		if err != nil {
			return models.ReserveResponse{}, err
		}
		if viewerID != "" && len(items) == 1 && items[0].Status == models.StatusMine {
			return models.ReserveResponse{Item: items[0]}, nil
		}
		return models.ReserveResponse{}, errTaken
	}
	if viewerID != "" {
		if _, err := pool.Exec(ctx, `
INSERT INTO list_followers (list_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, l.id, viewerID); err != nil {
			return models.ReserveResponse{}, err
		}
	}

	items, err := publicItems(ctx, pool, l.id, in.ItemID, viewerID)
	if err != nil || len(items) == 0 {
		return models.ReserveResponse{}, firstErr(err, errNotFound)
	}
	item := items[0]
	item.Status = models.StatusMine
	resp := models.ReserveResponse{Item: item}
	if viewerID == "" {
		resp.UndoToken = &undo
		sendUndoMail(ctx, email, l, item, in.Token, undo, baseURL)
	}
	return resp, nil
}

func sendUndoMail(ctx context.Context, to string, l sharedList, item models.PublicItem, shareToken, undo, baseURL string) {
	if !Mailer.Enabled() {
		return
	}
	link := strings.TrimRight(baseURL, "/") + "/w/" + shareToken + "?undo=" + undo
	err := Mailer.Send(ctx, mailer.Message{
		To:      to,
		Subject: "You're getting " + item.Name,
		Text: "You said you'll get " + item.Name + " from " + l.title + ". Everyone else now sees it as taken.\n\n" +
			"Plans changed? Undo it here:\n" + link + "\n",
	})
	if err != nil {
		log.Printf("undo mail for list %d: %v", l.id, err)
	}
}

// Unreserve drops a reservation made through the link: a signed-in visitor's own, or a guest's with
// their undo token.
func Unreserve(ctx context.Context, viewerID string, in ReserveInput) (models.PublicItem, error) {
	pool, err := db.Pool(ctx)
	if err != nil {
		return models.PublicItem{}, err
	}
	l, err := openSharedList(ctx, pool, in.Token)
	if err != nil {
		return models.PublicItem{}, err
	}
	if viewerID != "" && viewerID == l.ownerID {
		return models.PublicItem{}, forbidden("This is your own list. Friends reserve here, you don't.")
	}
	var tag interface{ RowsAffected() int64 }
	switch {
	case strings.TrimSpace(in.UndoToken) != "":
		tag, err = pool.Exec(ctx, `
DELETE FROM reservations r USING items i
WHERE r.item_id = i.id AND i.list_id = $1 AND r.item_id = $2 AND r.undo_token_hash = $3`,
			l.id, in.ItemID, hashToken(strings.TrimSpace(in.UndoToken)))
	case viewerID != "":
		tag, err = pool.Exec(ctx, `
DELETE FROM reservations r USING items i
WHERE r.item_id = i.id AND i.list_id = $1 AND r.item_id = $2 AND r.user_id = $3 AND r.source = 'web'`,
			l.id, in.ItemID, viewerID)
	default:
		return models.PublicItem{}, invalid("Sign in, or open the undo link from your email.")
	}
	if err != nil {
		return models.PublicItem{}, err
	}
	if tag.RowsAffected() == 0 {
		return models.PublicItem{}, errNotFound
	}
	items, err := publicItems(ctx, pool, l.id, in.ItemID, viewerID)
	if err != nil || len(items) == 0 {
		return models.PublicItem{}, firstErr(err, errNotFound)
	}
	return items[0], nil
}

// ── Abuse guard: at most 20 reservations per IP per hour. Per instance, best effort. ──

type rateLimiter struct {
	mu    sync.Mutex
	limit int
	every time.Duration
	hits  map[string][]time.Time
}

var reserveLimiter = &rateLimiter{limit: 20, every: time.Hour, hits: map[string][]time.Time{}}

func (l *rateLimiter) allow(key string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	cutoff := now.Add(-l.every)
	recent := l.hits[key][:0]
	for _, t := range l.hits[key] {
		if t.After(cutoff) {
			recent = append(recent, t)
		}
	}
	if len(recent) >= l.limit {
		l.hits[key] = recent
		return false
	}
	l.hits[key] = append(recent, now)
	if len(l.hits) > 10_000 { // keep memory bounded on a long-lived instance
		for k, v := range l.hits {
			if len(v) == 0 || !v[len(v)-1].After(cutoff) {
				delete(l.hits, k)
			}
		}
	}
	return true
}
