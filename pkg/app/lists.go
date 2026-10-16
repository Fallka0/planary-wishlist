package app

import (
	"context"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"

	"planary-wishlist/pkg/db"
	"planary-wishlist/pkg/models"
)

// ListInput is the body of POST and PATCH /api/lists. Nil fields stay unchanged on PATCH.
type ListInput struct {
	Kind           string    `json:"kind"`
	Title          *string   `json:"title"`
	PersonFullName *string   `json:"personFullName"`
	PersonNotes    *[]string `json:"personNotes"`
}

func cleanTitle(raw string) (string, error) {
	title := strings.Join(strings.Fields(raw), " ")
	if title == "" {
		return "", invalid("Give the list a name.")
	}
	if utf8.RuneCountInString(title) > 60 {
		return "", invalid("Keep the name under 60 characters.")
	}
	return title, nil
}

func cleanNotes(lines []string) (string, error) {
	var kept []string
	for _, line := range lines {
		line = strings.TrimSpace(strings.ReplaceAll(line, "\n", " "))
		if line == "" {
			continue
		}
		if utf8.RuneCountInString(line) > 200 {
			return "", invalid("Keep each note under 200 characters.")
		}
		kept = append(kept, line)
	}
	if len(kept) > 20 {
		return "", invalid("That's more than 20 notes. Combine a few.")
	}
	return strings.Join(kept, "\n"), nil
}

func splitNotes(joined string) []string {
	out := []string{}
	for _, line := range strings.Split(joined, "\n") {
		if line = strings.TrimSpace(line); line != "" {
			out = append(out, line)
		}
	}
	return out
}

// CreateList makes a wishlist or a person list owned by the user.
func CreateList(ctx context.Context, userID string, in ListInput, baseURL string) (any, error) {
	if in.Kind != KindWish && in.Kind != KindPerson {
		return nil, invalid("Choose what kind of list this is.")
	}
	if in.Title == nil {
		return nil, invalid("Give the list a name.")
	}
	title, err := cleanTitle(*in.Title)
	if err != nil {
		return nil, err
	}
	pool, err := db.Pool(ctx)
	if err != nil {
		return nil, err
	}
	var id int64
	if err := pool.QueryRow(ctx, `
INSERT INTO lists (owner_id, kind, title, position)
VALUES ($1, $2, $3, COALESCE((SELECT MAX(position) + 1 FROM lists WHERE owner_id = $1 AND kind = $2), 0))
RETURNING id`, userID, in.Kind, title).Scan(&id); err != nil {
		return nil, err
	}
	return GetList(ctx, userID, id, baseURL)
}

// GetList returns a WishListDetail or a PersonListDetail.
func GetList(ctx context.Context, userID string, listID int64, baseURL string) (any, error) {
	pool, err := db.Pool(ctx)
	if err != nil {
		return nil, err
	}
	a, err := listAccess(ctx, pool, listID, userID)
	if err != nil {
		return nil, err
	}
	if a.Kind == KindWish {
		return wishDetail(ctx, pool, a, baseURL)
	}
	return personDetail(ctx, pool, a, userID)
}

// UpdateList renames a list or edits a person's full name and notes. Owners only.
func UpdateList(ctx context.Context, userID string, listID int64, in ListInput, baseURL string) (any, error) {
	pool, err := db.Pool(ctx)
	if err != nil {
		return nil, err
	}
	a, err := listAccess(ctx, pool, listID, userID)
	if err != nil {
		return nil, err
	}
	if err := requireOwner(a, "Only the person who started this list can change it."); err != nil {
		return nil, err
	}

	sets := []string{"updated_at = NOW()"}
	args := []any{listID}
	add := func(column string, value any) {
		args = append(args, value)
		sets = append(sets, column+" = $"+strconv.Itoa(len(args)))
	}
	if in.Title != nil {
		title, err := cleanTitle(*in.Title)
		if err != nil {
			return nil, err
		}
		add("title", title)
	}
	if in.PersonFullName != nil || in.PersonNotes != nil {
		if a.Kind != KindPerson {
			return nil, invalid("Only gift idea lists have a full name and notes.")
		}
	}
	if in.PersonFullName != nil {
		name := strings.Join(strings.Fields(*in.PersonFullName), " ")
		if utf8.RuneCountInString(name) > 80 {
			return nil, invalid("Keep the full name under 80 characters.")
		}
		add("person_full_name", name)
	}
	if in.PersonNotes != nil {
		notes, err := cleanNotes(*in.PersonNotes)
		if err != nil {
			return nil, err
		}
		add("person_notes", notes)
	}
	if _, err := pool.Exec(ctx, "UPDATE lists SET "+strings.Join(sets, ", ")+" WHERE id = $1", args...); err != nil {
		return nil, err
	}
	return GetList(ctx, userID, listID, baseURL)
}

// DeleteList removes a list with everything on it. Owners only.
func DeleteList(ctx context.Context, userID string, listID int64) error {
	pool, err := db.Pool(ctx)
	if err != nil {
		return err
	}
	a, err := listAccess(ctx, pool, listID, userID)
	if err != nil {
		return err
	}
	if err := requireOwner(a, "Only the person who started this list can delete it."); err != nil {
		return err
	}
	_, err = pool.Exec(ctx, "DELETE FROM lists WHERE id = $1", listID)
	return err
}

// ── Building the detail views ──

func shareState(enabled bool, token *string, baseURL string) models.ShareState {
	if !enabled || token == nil {
		return models.ShareState{Enabled: false, URL: nil}
	}
	u := strings.TrimRight(baseURL, "/") + "/w/" + *token
	return models.ShareState{Enabled: true, URL: &u}
}

// wishDetail is the owner's view of their wishlist. It never reads reservations.
func wishDetail(ctx context.Context, q querier, a access, baseURL string) (models.WishListDetail, error) {
	if !a.isOwner() {
		return models.WishListDetail{}, errNotFound
	}
	var enabled bool
	var token *string
	if err := q.QueryRow(ctx, "SELECT share_enabled, share_token FROM lists WHERE id = $1", a.ListID).Scan(&enabled, &token); err != nil {
		return models.WishListDetail{}, err
	}
	occasions, err := loadOccasions(ctx, q, []int64{a.ListID})
	if err != nil {
		return models.WishListDetail{}, err
	}
	items, err := wishItems(ctx, q, a.ListID, 0)
	if err != nil {
		return models.WishListDetail{}, err
	}
	return models.WishListDetail{
		ID:       a.ListID,
		Kind:     KindWish,
		Title:    a.Title,
		Occasion: firstOccasion(occasions[a.ListID]),
		Share:    shareState(enabled, token, baseURL),
		Items:    items,
	}, nil
}

func personDetail(ctx context.Context, q querier, a access, userID string) (models.PersonListDetail, error) {
	var fullName, notes string
	if err := q.QueryRow(ctx, "SELECT person_full_name, person_notes FROM lists WHERE id = $1", a.ListID).Scan(&fullName, &notes); err != nil {
		return models.PersonListDetail{}, err
	}
	occasions, err := loadOccasions(ctx, q, []int64{a.ListID})
	if err != nil {
		return models.PersonListDetail{}, err
	}
	members, err := listMembers(ctx, q, a.ListID, userID)
	if err != nil {
		return models.PersonListDetail{}, err
	}
	ideas, err := loadIdeas(ctx, q, a.ListID, 0, userID)
	if err != nil {
		return models.PersonListDetail{}, err
	}
	owner, err := people(ctx, q, []string{a.OwnerID}, userID)
	if err != nil {
		return models.PersonListDetail{}, err
	}
	occ := occasions[a.ListID]
	if occ == nil {
		occ = []models.Occasion{}
	}
	return models.PersonListDetail{
		ID:             a.ListID,
		Kind:           KindPerson,
		Title:          a.Title,
		PersonFullName: fullName,
		PersonNotes:    splitNotes(notes),
		Occasions:      occ,
		Role:           a.Role,
		Owner:          owner[a.OwnerID],
		Members:        members,
		Items:          ideas,
	}, nil
}

func firstOccasion(occ []models.Occasion) *models.Occasion {
	if len(occ) == 0 {
		return nil
	}
	o := occ[0]
	return &o
}

// sortOccasions puts the soonest next occurrence first; past one-off dates go last.
func sortOccasions(occ []models.Occasion) {
	from := today()
	key := func(o models.Occasion) (int, bool) {
		d, ok := NextOccurrence(o.Month, o.Day, o.Year, from)
		return DaysBetween(from, d), ok
	}
	sort.SliceStable(occ, func(i, j int) bool {
		di, oki := key(occ[i])
		dj, okj := key(occ[j])
		if oki != okj {
			return oki
		}
		if di != dj {
			return di < dj
		}
		return occ[i].ID < occ[j].ID
	})
}
