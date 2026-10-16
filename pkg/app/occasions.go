package app

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"

	"planary-wishlist/pkg/db"
	"planary-wishlist/pkg/models"

	"github.com/jackc/pgx/v5"
)

// OccasionInput is the body of POST and PATCH /api/occasions. On PATCH, left-out fields stay;
// year and budgetCents can be set to null.
type OccasionInput struct {
	ListID      int64           `json:"listId"`
	Label       *string         `json:"label"`
	Month       *int            `json:"month"`
	Day         *int            `json:"day"`
	Year        Optional[int]   `json:"year"`
	BudgetCents Optional[int64] `json:"budgetCents"`
}

func (in OccasionInput) applyTo(o *models.Occasion) error {
	if in.Label != nil {
		o.Label = strings.Join(strings.Fields(*in.Label), " ")
	}
	if in.Month != nil {
		o.Month = *in.Month
	}
	if in.Day != nil {
		o.Day = *in.Day
	}
	if in.Year.Set {
		o.Year = nil
		if !in.Year.Null {
			y := in.Year.Value
			o.Year = &y
		}
	}
	if in.BudgetCents.Set {
		o.BudgetCents = nil
		if !in.BudgetCents.Null {
			b := in.BudgetCents.Value
			o.BudgetCents = &b
		}
	}

	switch {
	case o.Label == "":
		return invalid("Name the date, like Birthday.")
	case utf8.RuneCountInString(o.Label) > 40:
		return invalid("Keep the name under 40 characters.")
	case o.Month < 1 || o.Month > 12:
		return invalid("Pick a month.")
	case o.Year != nil && (*o.Year < 2000 || *o.Year > 2100):
		return invalid("Pick a year between 2000 and 2100, or leave it empty for every year.")
	case o.BudgetCents != nil && (*o.BudgetCents < 0 || *o.BudgetCents > 100_000_000_00):
		return invalid("That budget doesn't look right.")
	}
	year := 0 // any year: Feb 29 is fine and counts down to Feb 28 in other years
	if o.Year != nil {
		year = *o.Year
	}
	if o.Day < 1 || o.Day > daysIn(o.Month, year) {
		return invalid("That day doesn't exist in that month.")
	}
	return nil
}

// occasionEditor: owners on both kinds of list, co-planners on person lists.
func occasionEditor(a access) error {
	if a.Kind == KindWish && !a.isOwner() {
		return errNotFound
	}
	return nil
}

// CreateOccasion adds a date. A wishlist can have one (409 one_occasion).
func CreateOccasion(ctx context.Context, userID string, in OccasionInput) (models.Occasion, error) {
	pool, err := db.Pool(ctx)
	if err != nil {
		return models.Occasion{}, err
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return models.Occasion{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	a, err := listAccess(ctx, tx, in.ListID, userID)
	if err != nil {
		return models.Occasion{}, err
	}
	if err := occasionEditor(a); err != nil {
		return models.Occasion{}, err
	}
	var o models.Occasion
	if err := in.applyTo(&o); err != nil {
		return models.Occasion{}, err
	}
	if a.Kind == KindWish {
		// Lock the list so two requests can't both add the one date.
		var n int
		if err := tx.QueryRow(ctx, `
SELECT (SELECT COUNT(*) FROM occasions WHERE list_id = l.id) FROM lists l WHERE l.id = $1 FOR UPDATE`, a.ListID).Scan(&n); err != nil {
			return models.Occasion{}, err
		}
		if n > 0 {
			return models.Occasion{}, errOneOccasion
		}
	}
	if err := tx.QueryRow(ctx, `
INSERT INTO occasions (list_id, label, month, day, year, budget_cents) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
		a.ListID, o.Label, o.Month, o.Day, o.Year, o.BudgetCents).Scan(&o.ID); err != nil {
		return models.Occasion{}, err
	}
	return o, tx.Commit(ctx)
}

func occasionAccess(ctx context.Context, q querier, occasionID int64, userID string) (access, models.Occasion, error) {
	var listID int64
	var o models.Occasion
	var year *int16
	err := q.QueryRow(ctx, `SELECT list_id, id, label, month, day, year, budget_cents FROM occasions WHERE id = $1`, occasionID).
		Scan(&listID, &o.ID, &o.Label, &o.Month, &o.Day, &year, &o.BudgetCents)
	if errors.Is(err, pgx.ErrNoRows) {
		return access{}, o, errNotFound
	}
	if err != nil {
		return access{}, o, err
	}
	if year != nil {
		y := int(*year)
		o.Year = &y
	}
	a, err := listAccess(ctx, q, listID, userID)
	if err != nil {
		return access{}, o, err
	}
	return a, o, occasionEditor(a)
}

// UpdateOccasion changes a date or its budget.
func UpdateOccasion(ctx context.Context, userID string, occasionID int64, in OccasionInput) (models.Occasion, error) {
	pool, err := db.Pool(ctx)
	if err != nil {
		return models.Occasion{}, err
	}
	_, o, err := occasionAccess(ctx, pool, occasionID, userID)
	if err != nil {
		return models.Occasion{}, err
	}
	if err := in.applyTo(&o); err != nil {
		return models.Occasion{}, err
	}
	_, err = pool.Exec(ctx, `UPDATE occasions SET label = $2, month = $3, day = $4, year = $5, budget_cents = $6 WHERE id = $1`,
		o.ID, o.Label, o.Month, o.Day, o.Year, o.BudgetCents)
	return o, err
}

// DeleteOccasion removes a date and the picks that counted toward it.
func DeleteOccasion(ctx context.Context, userID string, occasionID int64) error {
	pool, err := db.Pool(ctx)
	if err != nil {
		return err
	}
	if _, _, err := occasionAccess(ctx, pool, occasionID, userID); err != nil {
		return err
	}
	_, err = pool.Exec(ctx, "DELETE FROM occasions WHERE id = $1", occasionID)
	return err
}

// loadOccasions returns each list's occasions, soonest first.
func loadOccasions(ctx context.Context, q querier, listIDs []int64) (map[int64][]models.Occasion, error) {
	out := map[int64][]models.Occasion{}
	if len(listIDs) == 0 {
		return out, nil
	}
	rows, err := q.Query(ctx, `
SELECT list_id, id, label, month, day, year, budget_cents FROM occasions WHERE list_id = ANY($1) ORDER BY id`, listIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var listID int64
		var o models.Occasion
		var year *int16
		if err := rows.Scan(&listID, &o.ID, &o.Label, &o.Month, &o.Day, &year, &o.BudgetCents); err != nil {
			return nil, err
		}
		if year != nil {
			y := int(*year)
			o.Year = &y
		}
		out[listID] = append(out[listID], o)
	}
	for _, occ := range out {
		sortOccasions(occ)
	}
	return out, rows.Err()
}
