package httpapi

import (
	"net/http"

	"planary-wishlist/pkg/app"
	"planary-wishlist/pkg/httpx"
	"planary-wishlist/pkg/models"
)

// Handlers for the v2 API (docs/wishlist-v2/api/API.md). They stay thin: parse, call pkg/app, write.

// MeV2 is GET /api/me.
func MeV2(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	user, ok := requireUser(w, r)
	if !ok {
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]models.Profile{"me": app.Me(user)})
}

// Search is GET /api/search?q=.
func Search(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	user, ok := requireUser(w, r)
	if !ok {
		return
	}
	res, err := app.Search(r.Context(), user.ID, r.URL.Query().Get("q"))
	if err != nil {
		writeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

// Overview is GET /api/overview.
func Overview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	user, ok := requireUser(w, r)
	if !ok {
		return
	}
	res, err := app.Overview(r.Context(), user)
	if err != nil {
		writeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

// Lists is /api/lists: POST creates, GET/PATCH/DELETE take ?id=.
func Lists(w http.ResponseWriter, r *http.Request) {
	user, ok := requireUser(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	if r.Method == http.MethodPost {
		var in app.ListInput
		if !decode(w, r, &in) {
			return
		}
		list, err := app.CreateList(ctx, user.ID, in, baseURL(r))
		if err != nil {
			writeError(w, r, err)
			return
		}
		httpx.JSON(w, http.StatusCreated, map[string]any{"list": list})
		return
	}

	id, ok := queryID(w, r, "id")
	if !ok {
		return
	}
	var list any
	var err error
	switch r.Method {
	case http.MethodGet:
		list, err = app.GetList(ctx, user.ID, id, baseURL(r))
	case http.MethodPatch:
		var in app.ListInput
		if !decode(w, r, &in) {
			return
		}
		list, err = app.UpdateList(ctx, user.ID, id, in, baseURL(r))
	case http.MethodDelete:
		if err := app.DeleteList(ctx, user.ID, id); err != nil {
			writeError(w, r, err)
			return
		}
		httpx.NoContent(w)
		return
	default:
		methodNotAllowed(w)
		return
	}
	if err != nil {
		writeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"list": list})
}

// Items is /api/items: POST creates, PATCH/DELETE take ?id=.
func Items(w http.ResponseWriter, r *http.Request) {
	user, ok := requireUser(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	switch r.Method {
	case http.MethodPost:
		var in app.ItemInput
		if !decode(w, r, &in) {
			return
		}
		item, err := app.CreateItem(ctx, user.ID, in)
		if err != nil {
			writeError(w, r, err)
			return
		}
		httpx.JSON(w, http.StatusCreated, map[string]any{"item": item})
	case http.MethodPatch:
		id, ok := queryID(w, r, "id")
		if !ok {
			return
		}
		var in app.ItemInput
		if !decode(w, r, &in) {
			return
		}
		item, err := app.UpdateItem(ctx, user.ID, id, in)
		if err != nil {
			writeError(w, r, err)
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"item": item})
	case http.MethodDelete:
		id, ok := queryID(w, r, "id")
		if !ok {
			return
		}
		if err := app.DeleteItem(ctx, user.ID, id); err != nil {
			writeError(w, r, err)
			return
		}
		httpx.NoContent(w)
	default:
		methodNotAllowed(w)
	}
}

// LinkPreview is POST /api/link-preview. Signed in only, so it's no open proxy.
func LinkPreview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	if _, ok := requireUser(w, r); !ok {
		return
	}
	var in struct {
		URL string `json:"url"`
	}
	if !decode(w, r, &in) {
		return
	}
	preview, err := app.LinkPreview(r.Context(), in.URL)
	if err != nil {
		writeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"preview": preview})
}

// Occasions is /api/occasions: POST creates, PATCH/DELETE take ?id=.
func Occasions(w http.ResponseWriter, r *http.Request) {
	user, ok := requireUser(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	switch r.Method {
	case http.MethodPost:
		var in app.OccasionInput
		if !decode(w, r, &in) {
			return
		}
		o, err := app.CreateOccasion(ctx, user.ID, in)
		if err != nil {
			writeError(w, r, err)
			return
		}
		httpx.JSON(w, http.StatusCreated, map[string]any{"occasion": o})
	case http.MethodPatch:
		id, ok := queryID(w, r, "id")
		if !ok {
			return
		}
		var in app.OccasionInput
		if !decode(w, r, &in) {
			return
		}
		o, err := app.UpdateOccasion(ctx, user.ID, id, in)
		if err != nil {
			writeError(w, r, err)
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"occasion": o})
	case http.MethodDelete:
		id, ok := queryID(w, r, "id")
		if !ok {
			return
		}
		if err := app.DeleteOccasion(ctx, user.ID, id); err != nil {
			writeError(w, r, err)
			return
		}
		httpx.NoContent(w)
	default:
		methodNotAllowed(w)
	}
}

// Picks is PUT /api/picks.
func Picks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		methodNotAllowed(w)
		return
	}
	user, ok := requireUser(w, r)
	if !ok {
		return
	}
	var in struct {
		ItemID     int64 `json:"itemId"`
		OccasionID int64 `json:"occasionId"`
		Picked     bool  `json:"picked"`
	}
	if !decode(w, r, &in) {
		return
	}
	idea, err := app.SetPick(r.Context(), user.ID, in.ItemID, in.OccasionID, in.Picked)
	if err != nil {
		writeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"item": idea})
}

// Claims is POST/DELETE /api/claims?itemId=.
func Claims(w http.ResponseWriter, r *http.Request) {
	user, ok := requireUser(w, r)
	if !ok {
		return
	}
	id, ok := queryID(w, r, "itemId")
	if !ok {
		return
	}
	var idea models.Idea
	var err error
	switch r.Method {
	case http.MethodPost:
		idea, err = app.Claim(r.Context(), user.ID, id)
	case http.MethodDelete:
		idea, err = app.Unclaim(r.Context(), user.ID, id)
	default:
		methodNotAllowed(w)
		return
	}
	if err != nil {
		writeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"item": idea})
}

// Share is PUT /api/share?listId=.
func Share(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		methodNotAllowed(w)
		return
	}
	user, ok := requireUser(w, r)
	if !ok {
		return
	}
	id, ok := queryID(w, r, "listId")
	if !ok {
		return
	}
	var in struct {
		Enabled bool `json:"enabled"`
	}
	if !decode(w, r, &in) {
		return
	}
	state, err := app.SetSharing(r.Context(), user.ID, id, in.Enabled, baseURL(r))
	if err != nil {
		writeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"share": state})
}

// ShareRotate is POST /api/share/rotate?listId=.
func ShareRotate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	user, ok := requireUser(w, r)
	if !ok {
		return
	}
	id, ok := queryID(w, r, "listId")
	if !ok {
		return
	}
	state, err := app.RotateShareLink(r.Context(), user.ID, id, baseURL(r))
	if err != nil {
		writeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"share": state})
}

// Public is GET /api/public?token=. No account needed.
func Public(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	user, _ := optionalUser(r)
	res, err := app.PublicList(r.Context(), user.ID, r.URL.Query().Get("token"))
	if err != nil {
		writeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

// PublicReserve is POST/DELETE /api/public/reserve. No account needed.
func PublicReserve(w http.ResponseWriter, r *http.Request) {
	user, _ := optionalUser(r)
	var in app.ReserveInput
	switch r.Method {
	case http.MethodPost:
		if !decode(w, r, &in) {
			return
		}
		res, err := app.Reserve(r.Context(), user.ID, in, clientIP(r), baseURL(r))
		if err != nil {
			writeError(w, r, err)
			return
		}
		httpx.JSON(w, http.StatusOK, res)
	case http.MethodDelete:
		if !decode(w, r, &in) {
			return
		}
		item, err := app.Unreserve(r.Context(), user.ID, in)
		if err != nil {
			writeError(w, r, err)
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"item": item})
	default:
		methodNotAllowed(w)
	}
}

// Members is POST /api/members (invite) and DELETE /api/members?id= (remove or leave).
func Members(w http.ResponseWriter, r *http.Request) {
	user, ok := requireUser(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodPost:
		var in struct {
			ListID int64  `json:"listId"`
			Email  string `json:"email"`
		}
		if !decode(w, r, &in) {
			return
		}
		res, err := app.Invite(r.Context(), user, in.ListID, in.Email, baseURL(r))
		if err != nil {
			writeError(w, r, err)
			return
		}
		httpx.JSON(w, http.StatusCreated, res)
	case http.MethodDelete:
		id, ok := queryID(w, r, "id")
		if !ok {
			return
		}
		if err := app.RemoveMember(r.Context(), user.ID, id); err != nil {
			writeError(w, r, err)
			return
		}
		httpx.NoContent(w)
	default:
		methodNotAllowed(w)
	}
}

// MembersLink is POST /api/members/link?listId=: a fresh reusable invite link.
func MembersLink(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	user, ok := requireUser(w, r)
	if !ok {
		return
	}
	id, ok := queryID(w, r, "listId")
	if !ok {
		return
	}
	link, err := app.InviteLink(r.Context(), user.ID, id, baseURL(r))
	if err != nil {
		writeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"inviteUrl": link})
}

// Invite is GET /api/invite?token=.
func Invite(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	user, ok := requireUser(w, r)
	if !ok {
		return
	}
	res, err := app.PreviewInvite(r.Context(), user.ID, r.URL.Query().Get("token"))
	if err != nil {
		writeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

// InviteAccept is POST /api/invite/accept.
func InviteAccept(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	user, ok := requireUser(w, r)
	if !ok {
		return
	}
	var in struct {
		Token string `json:"token"`
	}
	if !decode(w, r, &in) {
		return
	}
	listID, err := app.AcceptInvite(r.Context(), user, in.Token)
	if err != nil {
		writeError(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]int64{"listId": listID})
}
