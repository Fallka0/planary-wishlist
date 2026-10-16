package app

import (
	"context"
	"errors"

	"planary-wishlist/pkg/db"
	"planary-wishlist/pkg/models"

	"github.com/jackc/pgx/v5"
)

// personIdeaAccess loads an idea on a person list the user plans. Wishlist items are a 404 here,
// before anything about their reservations is looked at.
func personIdeaAccess(ctx context.Context, q querier, itemID int64, userID string) (access, error) {
	a, _, err := itemAccess(ctx, q, itemID, userID)
	if err != nil {
		return access{}, err
	}
	if a.Kind != KindPerson {
		return access{}, errNotFound
	}
	return a, nil
}

// SetPick ticks or unticks an idea toward an occasion's budget.
func SetPick(ctx context.Context, userID string, itemID, occasionID int64, picked bool) (models.Idea, error) {
	pool, err := db.Pool(ctx)
	if err != nil {
		return models.Idea{}, err
	}
	a, err := personIdeaAccess(ctx, pool, itemID, userID)
	if err != nil {
		return models.Idea{}, err
	}
	var sameList bool
	if err := pool.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM occasions WHERE id = $1 AND list_id = $2)", occasionID, a.ListID).Scan(&sameList); err != nil {
		return models.Idea{}, err
	}
	if !sameList {
		return models.Idea{}, invalid("That date isn't on this list.")
	}
	if picked {
		_, err = pool.Exec(ctx, "INSERT INTO item_picks (item_id, occasion_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", itemID, occasionID)
	} else {
		_, err = pool.Exec(ctx, "DELETE FROM item_picks WHERE item_id = $1 AND occasion_id = $2", itemID, occasionID)
	}
	if err != nil {
		return models.Idea{}, err
	}
	return oneIdea(ctx, pool, a.ListID, itemID, userID)
}

func oneIdea(ctx context.Context, q querier, listID, itemID int64, userID string) (models.Idea, error) {
	ideas, err := loadIdeas(ctx, q, listID, itemID, userID)
	if err != nil || len(ideas) == 0 {
		return models.Idea{}, firstErr(err, errNotFound)
	}
	return ideas[0], nil
}

// Claim marks an idea as "I'll get this" for the user. 409 taken when a co-planner has it.
func Claim(ctx context.Context, userID string, itemID int64) (models.Idea, error) {
	pool, err := db.Pool(ctx)
	if err != nil {
		return models.Idea{}, err
	}
	a, err := personIdeaAccess(ctx, pool, itemID, userID)
	if err != nil {
		return models.Idea{}, err
	}
	var holder *string
	err = pool.QueryRow(ctx, `
WITH ins AS (
  INSERT INTO reservations (item_id, source, user_id) VALUES ($1, 'member', $2)
  ON CONFLICT (item_id) DO NOTHING
  RETURNING user_id::text
)
SELECT user_id FROM ins
UNION ALL
SELECT user_id::text FROM reservations WHERE item_id = $1 AND NOT EXISTS (SELECT 1 FROM ins)`, itemID, userID).Scan(&holder)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return models.Idea{}, err
	}
	if holder == nil || *holder != userID {
		return models.Idea{}, errTaken
	}
	return oneIdea(ctx, pool, a.ListID, itemID, userID)
}

// Unclaim drops a claim. Your own, or anyone's if you own the list.
func Unclaim(ctx context.Context, userID string, itemID int64) (models.Idea, error) {
	pool, err := db.Pool(ctx)
	if err != nil {
		return models.Idea{}, err
	}
	a, err := personIdeaAccess(ctx, pool, itemID, userID)
	if err != nil {
		return models.Idea{}, err
	}
	var holder *string
	err = pool.QueryRow(ctx, "SELECT user_id::text FROM reservations WHERE item_id = $1", itemID).Scan(&holder)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		return oneIdea(ctx, pool, a.ListID, itemID, userID) // nothing to undo
	case err != nil:
		return models.Idea{}, err
	case !a.isOwner() && (holder == nil || *holder != userID):
		return models.Idea{}, forbidden("Only the person getting it can undo that.")
	}
	if _, err := pool.Exec(ctx, "DELETE FROM reservations WHERE item_id = $1", itemID); err != nil {
		return models.Idea{}, err
	}
	return oneIdea(ctx, pool, a.ListID, itemID, userID)
}
