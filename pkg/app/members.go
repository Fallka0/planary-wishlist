package app

import (
	"context"
	"errors"
	"log"
	"net/mail"
	"strings"

	"planary-wishlist/pkg/auth"
	"planary-wishlist/pkg/db"
	mailer "planary-wishlist/pkg/mail"
	"planary-wishlist/pkg/models"

	"github.com/jackc/pgx/v5"
)

// Mailer sends invites and undo links. Tests replace it.
var Mailer mailer.Sender = mailer.FromEnv()

func cleanEmail(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	addr, err := mail.ParseAddress(raw)
	if err != nil || addr.Address != raw || !strings.Contains(raw[strings.LastIndex(raw, "@"):], ".") || len(raw) > 254 {
		return "", invalid("That email address doesn't look right.")
	}
	return strings.ToLower(raw), nil
}

func inviteURL(baseURL, token string) string {
	return strings.TrimRight(baseURL, "/") + "/invite/" + token
}

// listMembers returns the co-planners of a person list, active and invited, oldest first.
func listMembers(ctx context.Context, q querier, listID int64, me string) ([]models.Member, error) {
	rows, err := q.Query(ctx, `
SELECT id, email, COALESCE(user_id::text, ''), status FROM list_members WHERE list_id = $1 ORDER BY created_at, id`, listID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	members := []models.Member{}
	var ids []string
	for rows.Next() {
		var m models.Member
		var userID string
		if err := rows.Scan(&m.ID, &m.Email, &userID, &m.Status); err != nil {
			return nil, err
		}
		if userID != "" {
			m.User = &models.PersonRef{ID: userID}
			ids = append(ids, userID)
		}
		members = append(members, m)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	refs, err := people(ctx, q, ids, me)
	if err != nil {
		return nil, err
	}
	for i := range members {
		if members[i].User != nil {
			ref := refs[members[i].User.ID]
			members[i].User = &ref
		}
	}
	return members, nil
}

// Invite asks someone by email to plan a person list together. Owners only.
func Invite(ctx context.Context, user auth.User, listID int64, rawEmail, baseURL string) (models.InviteResponse, error) {
	pool, err := db.Pool(ctx)
	if err != nil {
		return models.InviteResponse{}, err
	}
	a, err := listAccess(ctx, pool, listID, user.ID)
	if err != nil {
		return models.InviteResponse{}, err
	}
	if a.Kind != KindPerson {
		return models.InviteResponse{}, invalid("Only gift idea lists can be planned together.")
	}
	if err := requireOwner(a, "Only the person who started this list can invite others."); err != nil {
		return models.InviteResponse{}, err
	}
	email, err := cleanEmail(rawEmail)
	if err != nil {
		return models.InviteResponse{}, err
	}
	if strings.EqualFold(email, user.Email) {
		return models.InviteResponse{}, invalid("That's you. Invite someone else.")
	}

	token := newSecretToken()
	var memberID int64
	var status string
	err = pool.QueryRow(ctx, `
INSERT INTO list_members (list_id, email, invite_token_hash, invited_by) VALUES ($1, $2, $3, $4)
ON CONFLICT (list_id, email) DO UPDATE SET invite_token_hash = EXCLUDED.invite_token_hash
  WHERE list_members.status = 'invited'
RETURNING id, status`, listID, email, hashToken(token), user.ID).Scan(&memberID, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.InviteResponse{}, invalid(email + " is already planning with you.")
	}
	if err != nil {
		return models.InviteResponse{}, err
	}

	link := inviteURL(baseURL, token)
	sent := false
	if Mailer.Enabled() {
		inviter := auth.DisplayName(user)
		err := Mailer.Send(ctx, mailer.Message{
			To:      email,
			Subject: inviter + " invited you to plan gifts for " + a.Title,
			Text: inviter + " wants to plan gifts for " + a.Title + " together on Planary Wishlist.\n\n" +
				"Open this link to join. You sign in with your Planary account, or create one:\n" + link + "\n",
		})
		if err != nil {
			log.Printf("invite mail to list %d: %v", listID, err)
		}
		sent = err == nil
	}
	return models.InviteResponse{
		Member:    models.Member{ID: memberID, Email: email, Status: status},
		InviteURL: link,
		EmailSent: sent,
	}, nil
}

// RemoveMember: the owner removes anyone; a co-planner can remove themselves (leave).
func RemoveMember(ctx context.Context, userID string, memberID int64) error {
	pool, err := db.Pool(ctx)
	if err != nil {
		return err
	}
	var listID int64
	var memberUser *string
	err = pool.QueryRow(ctx, "SELECT list_id, user_id::text FROM list_members WHERE id = $1", memberID).Scan(&listID, &memberUser)
	if errors.Is(err, pgx.ErrNoRows) {
		return errNotFound
	}
	if err != nil {
		return err
	}
	a, err := listAccess(ctx, pool, listID, userID)
	if err != nil {
		return err
	}
	if !a.isOwner() && (memberUser == nil || *memberUser != userID) {
		return forbidden("Only the person who started this list can remove others.")
	}
	_, err = pool.Exec(ctx, "DELETE FROM list_members WHERE id = $1", memberID)
	return err
}

// InviteLink makes a new reusable invite link for a person list. The previous link stops working.
func InviteLink(ctx context.Context, userID string, listID int64, baseURL string) (string, error) {
	pool, err := db.Pool(ctx)
	if err != nil {
		return "", err
	}
	a, err := listAccess(ctx, pool, listID, userID)
	if err != nil {
		return "", err
	}
	if a.Kind != KindPerson {
		return "", invalid("Only gift idea lists can be planned together.")
	}
	if err := requireOwner(a, "Only the person who started this list can invite others."); err != nil {
		return "", err
	}
	token := newSecretToken()
	if _, err := pool.Exec(ctx, "UPDATE lists SET invite_token_hash = $2 WHERE id = $1", listID, hashToken(token)); err != nil {
		return "", err
	}
	return inviteURL(baseURL, token), nil
}

// invite is a resolved invite token: a personal invite (memberID set) or a list's reusable link.
type invite struct {
	listID    int64
	listTitle string
	ownerID   string
	invitedBy string
	memberID  int64
	email     string // personal invites only
}

func findInvite(ctx context.Context, q querier, token string) (invite, error) {
	hash := hashToken(strings.TrimSpace(token))
	var inv invite
	err := q.QueryRow(ctx, `
SELECT l.id, l.title, l.owner_id::text, m.invited_by::text, m.id, m.email
FROM list_members m JOIN lists l ON l.id = m.list_id
WHERE m.invite_token_hash = $1 AND m.status = 'invited'`, hash).
		Scan(&inv.listID, &inv.listTitle, &inv.ownerID, &inv.invitedBy, &inv.memberID, &inv.email)
	if err == nil {
		return inv, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return inv, err
	}
	err = q.QueryRow(ctx, `
SELECT id, title, owner_id::text FROM lists WHERE invite_token_hash = $1 AND kind = 'person'`, hash).
		Scan(&inv.listID, &inv.listTitle, &inv.ownerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return inv, errNotFound
	}
	inv.invitedBy = inv.ownerID
	return inv, err
}

func isActiveMember(ctx context.Context, q querier, listID int64, userID string) (bool, error) {
	var ok bool
	err := q.QueryRow(ctx, `
SELECT EXISTS (SELECT 1 FROM list_members WHERE list_id = $1 AND user_id = $2 AND status = 'active')`, listID, userID).Scan(&ok)
	return ok, err
}

// PreviewInvite says whose list an invite is for, before the user accepts it.
func PreviewInvite(ctx context.Context, userID, token string) (models.InvitePreview, error) {
	pool, err := db.Pool(ctx)
	if err != nil {
		return models.InvitePreview{}, err
	}
	inv, err := findInvite(ctx, pool, token)
	if err != nil {
		return models.InvitePreview{}, err
	}
	refs, err := people(ctx, pool, []string{inv.invitedBy}, userID)
	if err != nil {
		return models.InvitePreview{}, err
	}
	already, err := isActiveMember(ctx, pool, inv.listID, userID)
	if err != nil {
		return models.InvitePreview{}, err
	}
	return models.InvitePreview{
		ListTitle:     inv.listTitle,
		InvitedBy:     refs[inv.invitedBy],
		AlreadyMember: already || inv.ownerID == userID,
	}, nil
}

// AcceptInvite makes the user an active co-planner. A personal invite only works for the email it was sent to.
func AcceptInvite(ctx context.Context, user auth.User, token string) (int64, error) {
	pool, err := db.Pool(ctx)
	if err != nil {
		return 0, err
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	inv, err := findInvite(ctx, tx, token)
	if err != nil {
		return 0, err
	}
	if inv.ownerID == user.ID {
		return 0, invalid("This is your own list.")
	}
	already, err := isActiveMember(ctx, tx, inv.listID, user.ID)
	if err != nil {
		return 0, err
	}
	if already {
		if inv.memberID != 0 {
			// A second invite for someone already on the list: drop it.
			if _, err := tx.Exec(ctx, "DELETE FROM list_members WHERE id = $1 AND status = 'invited'", inv.memberID); err != nil {
				return 0, err
			}
		}
		return inv.listID, tx.Commit(ctx)
	}

	if inv.memberID != 0 {
		if !strings.EqualFold(inv.email, user.Email) {
			return 0, forbidden("This invite was sent to " + inv.email + ". Sign in with that address to accept it.")
		}
		_, err = tx.Exec(ctx, `
UPDATE list_members SET user_id = $2, status = 'active', joined_at = NOW(), invite_token_hash = NULL WHERE id = $1`,
			inv.memberID, user.ID)
	} else {
		_, err = tx.Exec(ctx, `
INSERT INTO list_members (list_id, email, user_id, status, invited_by, joined_at)
VALUES ($1, $2, $3, 'active', $4, NOW())
ON CONFLICT (list_id, email) DO UPDATE
SET user_id = EXCLUDED.user_id, status = 'active', joined_at = NOW(), invite_token_hash = NULL`,
			inv.listID, strings.ToLower(user.Email), user.ID, inv.ownerID)
	}
	if err != nil {
		return 0, err
	}
	return inv.listID, tx.Commit(ctx)
}
