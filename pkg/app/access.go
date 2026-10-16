package app

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

const (
	KindWish   = "wish"
	KindPerson = "person"

	roleOwner  = "owner"
	roleMember = "member"
)

// access is what the caller may do with one list: they own it, or they're an active co-planner.
type access struct {
	ListID  int64
	Kind    string
	OwnerID string
	Title   string
	Role    string
}

func (a access) isOwner() bool { return a.Role == roleOwner }

// The permission filter every list query uses: the caller owns the list or is an active member of it.
const canSeeList = `(l.owner_id = $2::uuid OR EXISTS (
	SELECT 1 FROM list_members m WHERE m.list_id = l.id AND m.user_id = $2::uuid AND m.status = 'active'))`

// listAccess loads a list the user may see. Anything else is errNotFound, so it can't be probed.
func listAccess(ctx context.Context, q querier, listID int64, userID string) (access, error) {
	var a access
	err := q.QueryRow(ctx, `
SELECT l.id, l.kind, l.owner_id::text, l.title
FROM lists l
WHERE l.id = $1 AND `+canSeeList, listID, userID).Scan(&a.ListID, &a.Kind, &a.OwnerID, &a.Title)
	if errors.Is(err, pgx.ErrNoRows) {
		return access{}, errNotFound
	}
	if err != nil {
		return access{}, err
	}
	a.Role = roleMember
	if a.OwnerID == userID {
		a.Role = roleOwner
	}
	return a, nil
}

// itemAccess loads an item together with the caller's access to its list.
func itemAccess(ctx context.Context, q querier, itemID int64, userID string) (access, *string, error) {
	var a access
	var addedBy *string
	err := q.QueryRow(ctx, `
SELECT l.id, l.kind, l.owner_id::text, l.title, i.added_by::text
FROM items i
JOIN lists l ON l.id = i.list_id
WHERE i.id = $1 AND `+canSeeList, itemID, userID).Scan(&a.ListID, &a.Kind, &a.OwnerID, &a.Title, &addedBy)
	if errors.Is(err, pgx.ErrNoRows) {
		return access{}, nil, errNotFound
	}
	if err != nil {
		return access{}, nil, err
	}
	a.Role = roleMember
	if a.OwnerID == userID {
		a.Role = roleOwner
	}
	return a, addedBy, nil
}

// requireOwner turns a member's attempt at an owner-only action into a clear 403.
func requireOwner(a access, message string) error {
	if !a.isOwner() {
		return forbidden(message)
	}
	return nil
}
