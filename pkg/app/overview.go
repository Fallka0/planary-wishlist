package app

import (
	"context"

	"planary-wishlist/pkg/auth"
	"planary-wishlist/pkg/db"
	"planary-wishlist/pkg/models"
)

// Overview is everything the sidebar and home screen show.
func Overview(ctx context.Context, user auth.User) (models.OverviewResponse, error) {
	out := models.OverviewResponse{
		Me:     profileFor(user),
		Lists:  []models.WishListSummary{},
		People: []models.PersonSummary{},
		Shared: []models.SharedSummary{},
	}
	pool, err := db.Pool(ctx)
	if err != nil {
		return out, err
	}
	me := user.ID

	// My wishlists. Counts and previews come from items only, never from reservations.
	rows, err := pool.Query(ctx, `
SELECT l.id, l.title, l.share_enabled,
  (SELECT COUNT(*) FROM items i WHERE i.list_id = l.id),
  COALESCE((SELECT json_agg(json_build_object('imageUrl', p.image_url, 'store', p.store))
            FROM (SELECT i.image_url, i.store FROM items i WHERE i.list_id = l.id`+itemOrder+` LIMIT 4) p), '[]')
FROM lists l
WHERE l.owner_id = $1 AND l.kind = 'wish'
ORDER BY l.position, l.created_at, l.id`, me)
	if err != nil {
		return out, err
	}
	var listIDs []int64
	for rows.Next() {
		var s models.WishListSummary
		if err := rows.Scan(&s.ID, &s.Title, &s.Shared, &s.ItemCount, &s.Previews); err != nil {
			rows.Close()
			return out, err
		}
		out.Lists = append(out.Lists, s)
		listIDs = append(listIDs, s.ID)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return out, err
	}

	// Gift ideas: person lists I own or plan.
	rows, err = pool.Query(ctx, `
SELECT l.id, l.title, l.person_full_name, l.owner_id::text, (SELECT COUNT(*) FROM items i WHERE i.list_id = l.id)
FROM lists l
WHERE l.kind = 'person' AND `+canSeeListFirstParam+`
ORDER BY (l.owner_id = $1::uuid) DESC, l.position, l.created_at, l.id`, me)
	if err != nil {
		return out, err
	}
	var personIDs []int64
	owners := map[int64]string{}
	for rows.Next() {
		var s models.PersonSummary
		var owner string
		if err := rows.Scan(&s.ID, &s.Title, &s.PersonFullName, &owner, &s.IdeaCount); err != nil {
			rows.Close()
			return out, err
		}
		s.Role = roleMember
		if owner == me {
			s.Role = roleOwner
		}
		s.Occasions = []models.Occasion{}
		s.PickedCentsByOccasion = map[int64]int64{}
		s.PickedCountByOccasion = map[int64]int{}
		s.CoPlanners = []models.PersonRef{}
		out.People = append(out.People, s)
		personIDs = append(personIDs, s.ID)
		owners[s.ID] = owner
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return out, err
	}

	// Shared with me: links I opened while signed in, still switched on, not my own.
	rows, err = pool.Query(ctx, `
SELECT l.id, l.share_token, l.title, l.owner_id::text,
  COUNT(i.id), COUNT(r.item_id), COUNT(r.item_id) FILTER (WHERE r.user_id = $1)
FROM list_followers f
JOIN lists l ON l.id = f.list_id AND l.kind = 'wish' AND l.share_enabled AND l.owner_id <> $1
LEFT JOIN items i ON i.list_id = l.id
LEFT JOIN reservations r ON r.item_id = i.id
WHERE f.user_id = $1
GROUP BY l.id
ORDER BY MAX(f.created_at) DESC, l.id`, me)
	if err != nil {
		return out, err
	}
	var sharedIDs []int64
	var userIDs []string
	for rows.Next() {
		var s models.SharedSummary
		if err := rows.Scan(&s.ListID, &s.Token, &s.Title, &s.Owner.ID, &s.ItemCount, &s.TakenCount, &s.MineCount); err != nil {
			rows.Close()
			return out, err
		}
		out.Shared = append(out.Shared, s)
		sharedIDs = append(sharedIDs, s.ListID)
		userIDs = append(userIDs, s.Owner.ID)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return out, err
	}

	occasions, err := loadOccasions(ctx, pool, append(append(append([]int64{}, listIDs...), personIDs...), sharedIDs...))
	if err != nil {
		return out, err
	}
	for i := range out.Lists {
		out.Lists[i].Occasion = firstOccasion(occasions[out.Lists[i].ID])
		if out.Lists[i].Previews == nil {
			out.Lists[i].Previews = []models.ImagePreview{}
		}
	}
	for i := range out.Shared {
		out.Shared[i].Occasion = firstOccasion(occasions[out.Shared[i].ListID])
	}

	// Budget ticks per occasion. Mixed currencies are rare: the sum is CHF only.
	cents := map[int64]map[int64]int64{}
	counts := map[int64]map[int64]int{}
	planners := map[int64][]string{}
	if len(personIDs) > 0 {
		rows, err = pool.Query(ctx, `
SELECT o.list_id, o.id, COALESCE(SUM(i.price_cents) FILTER (WHERE i.currency = 'CHF'), 0), COUNT(*)
FROM occasions o
JOIN item_picks p ON p.occasion_id = o.id
JOIN items i ON i.id = p.item_id
WHERE o.list_id = ANY($1)
GROUP BY o.list_id, o.id`, personIDs)
		if err != nil {
			return out, err
		}
		for rows.Next() {
			var listID, occasionID, sum int64
			var n int
			if err := rows.Scan(&listID, &occasionID, &sum, &n); err != nil {
				rows.Close()
				return out, err
			}
			if cents[listID] == nil {
				cents[listID], counts[listID] = map[int64]int64{}, map[int64]int{}
			}
			cents[listID][occasionID], counts[listID][occasionID] = sum, n
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return out, err
		}

		// Co-planners: active members, plus the owner when I'm a member. Never me.
		rows, err = pool.Query(ctx, `
SELECT list_id, user_id::text FROM list_members WHERE list_id = ANY($1) AND status = 'active' ORDER BY joined_at, id`, personIDs)
		if err != nil {
			return out, err
		}
		for rows.Next() {
			var listID int64
			var userID string
			if err := rows.Scan(&listID, &userID); err != nil {
				rows.Close()
				return out, err
			}
			planners[listID] = append(planners[listID], userID)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return out, err
		}
	}
	for _, s := range out.People {
		if owners[s.ID] != me {
			planners[s.ID] = append([]string{owners[s.ID]}, planners[s.ID]...)
		}
		userIDs = append(userIDs, planners[s.ID]...)
	}

	refs, err := people(ctx, pool, userIDs, me)
	if err != nil {
		return out, err
	}
	for i := range out.People {
		s := &out.People[i]
		if occ := occasions[s.ID]; occ != nil {
			s.Occasions = occ
		}
		for k, v := range cents[s.ID] {
			s.PickedCentsByOccasion[k] = v
		}
		for k, v := range counts[s.ID] {
			s.PickedCountByOccasion[k] = v
		}
		for _, id := range planners[s.ID] {
			if id != me {
				s.CoPlanners = append(s.CoPlanners, refs[id])
			}
		}
	}
	for i := range out.Shared {
		out.Shared[i].Owner = refs[out.Shared[i].Owner.ID]
	}
	return out, nil
}

// canSeeListFirstParam is canSeeList for queries where the user id is $1.
const canSeeListFirstParam = `(l.owner_id = $1::uuid OR EXISTS (
	SELECT 1 FROM list_members m WHERE m.list_id = l.id AND m.user_id = $1::uuid AND m.status = 'active'))`
