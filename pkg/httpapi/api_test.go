package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math/rand/v2"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"strings"
	"testing"

	"planary-wishlist/pkg/auth"
	"planary-wishlist/pkg/db/dbtest"
)

// Integration tests: the real handlers on a throwaway database. They need DATABASE_URL_TEST
// (a postgres:// URL whose user can create databases) and are skipped without it.

var dbReady bool

func TestMain(m *testing.M) {
	base := os.Getenv("DATABASE_URL_TEST")
	code := 0
	if base == "" {
		code = m.Run()
		os.Exit(code)
	}
	dbURL, drop, err := dbtest.Create(context.Background(), base)
	if err != nil {
		log.Fatalf("create test database: %v", err)
	}
	os.Setenv("DATABASE_URL", dbURL)
	os.Setenv("PUBLIC_APP_URL", "https://wishlist.test")
	dbReady = true

	// "Bearer test|<uuid>|<email>|<name>" stands in for a planary-auth token.
	authenticate = func(r *http.Request) (auth.User, error) {
		parts := strings.Split(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "), "|")
		if len(parts) != 4 || parts[0] != "test" {
			return auth.User{}, errors.New("bad token")
		}
		return auth.User{ID: parts[1], Email: parts[2], Name: parts[3]}, nil
	}

	code = m.Run()
	drop()
	os.Exit(code)
}

func needDB(t *testing.T) {
	t.Helper()
	if !dbReady {
		t.Skip("DATABASE_URL_TEST is not set")
	}
}

type user struct{ id, email, name string }

func newUser(name string) *user {
	id := fmt.Sprintf("%08x-%04x-4%03x-8%03x-%012x", rand.Uint32(), rand.IntN(1<<16), rand.IntN(1<<12), rand.IntN(1<<12), rand.Uint64()&(1<<48-1))
	return &user{id: id, email: strings.ToLower(strings.Fields(name)[0]) + "." + id[:8] + "@example.ch", name: name}
}

type response struct {
	status int
	raw    string
	body   map[string]any
}

func (r response) str(path ...string) string {
	return fmt.Sprint(r.get(path...))
}

// get walks the JSON by keys and array indexes ("items", "0", "name").
func (r response) get(path ...string) any {
	var cur any = r.body
	for _, p := range path {
		switch c := cur.(type) {
		case map[string]any:
			cur = c[p]
		case []any:
			var i int
			fmt.Sscan(p, &i)
			if i >= len(c) {
				return nil
			}
			cur = c[i]
		default:
			return nil
		}
	}
	return cur
}

func (r response) id(path ...string) int64 {
	f, _ := r.get(path...).(float64)
	return int64(f)
}

// call runs one request through the real router. as is nil for a guest.
func call(t *testing.T, as *user, method, target string, body any) response {
	t.Helper()
	var reader io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		reader = bytes.NewReader(b)
	}
	req := httptest.NewRequest(method, target, reader)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", fmt.Sprintf("203.0.113.%d", rand.IntN(250)+1))
	if as != nil {
		req.Header.Set("Authorization", "Bearer test|"+as.id+"|"+as.email+"|"+as.name)
	}
	rec := httptest.NewRecorder()
	Mux().ServeHTTP(rec, req)
	res := response{status: rec.Code, raw: rec.Body.String()}
	if res.raw != "" {
		_ = json.Unmarshal(rec.Body.Bytes(), &res.body)
	}
	return res
}

func expect(t *testing.T, res response, status int, what string) response {
	t.Helper()
	if res.status != status {
		t.Fatalf("%s: status %d, want %d: %s", what, res.status, status, res.raw)
	}
	return res
}

func expectCode(t *testing.T, res response, status int, code, what string) {
	t.Helper()
	expect(t, res, status, what)
	if res.str("code") != code {
		t.Fatalf("%s: code %q, want %q", what, res.str("code"), code)
	}
}

func path(format string, args ...any) string { return fmt.Sprintf(format, args...) }

// ── Scenario helpers ──

func newList(t *testing.T, as *user, kind, title string) int64 {
	t.Helper()
	return expect(t, call(t, as, "POST", "/api/lists", map[string]any{"kind": kind, "title": title}), 201, "create list").id("list", "id")
}

func newItem(t *testing.T, as *user, listID int64, name string, price int) int64 {
	t.Helper()
	res := call(t, as, "POST", "/api/items", map[string]any{"listId": listID, "name": name, "priceCents": price, "url": "https://www.galaxus.ch/p/" + name})
	return expect(t, res, 201, "create item "+name).id("item", "id")
}

func shareToken(t *testing.T, as *user, listID int64) string {
	t.Helper()
	res := expect(t, call(t, as, "PUT", path("/api/share?listId=%d", listID), map[string]any{"enabled": true}), 200, "share")
	u := res.str("share", "url")
	return u[strings.LastIndex(u, "/")+1:]
}

// joinPersonList invites member to owner's person list and accepts.
func joinPersonList(t *testing.T, owner, member *user, listID int64) {
	t.Helper()
	inv := expect(t, call(t, owner, "POST", "/api/members", map[string]any{"listId": listID, "email": member.email}), 201, "invite")
	link := inv.str("inviteUrl")
	token := link[strings.LastIndex(link, "/")+1:]
	expect(t, call(t, member, "POST", "/api/invite/accept", map[string]any{"token": token}), 200, "accept")
}

// ── Tests ──

func TestAuthRequired(t *testing.T) {
	needDB(t)
	for _, target := range []string{"/api/me", "/api/overview", "/api/lists?id=1", "/api/search?q=ab", "/api/invite?token=x"} {
		expectCode(t, call(t, nil, "GET", target, nil), 401, "unauthorized", target)
	}
	expectCode(t, call(t, nil, "POST", "/api/link-preview", map[string]string{"url": "https://galaxus.ch"}), 401, "unauthorized", "link preview")
}

func TestMeAndProfile(t *testing.T) {
	needDB(t)
	noa := newUser("Noa Brunner")
	res := expect(t, call(t, noa, "GET", "/api/me", nil), 200, "me")
	if res.str("me", "displayName") != "Noa Brunner" || res.str("me", "initials") != "NB" || res.str("me", "id") != noa.id {
		t.Fatalf("me = %s", res.raw)
	}
}

func TestPermissionMatrix(t *testing.T) {
	needDB(t)
	noa, lea, max := newUser("Noa Brunner"), newUser("Lea Keller"), newUser("Max Muster")

	wish := newList(t, noa, "wish", "Ski season")
	mom := newList(t, noa, "person", "Mom")
	wishItem := newItem(t, noa, wish, "Goggles", 12900)
	noaIdea := newItem(t, noa, mom, "Scarf", 4900)

	// A stranger sees nothing and can't tell the lists exist.
	for _, c := range []struct{ method, target string }{
		{"GET", path("/api/lists?id=%d", wish)}, {"GET", path("/api/lists?id=%d", mom)},
		{"PATCH", path("/api/lists?id=%d", mom)}, {"DELETE", path("/api/lists?id=%d", wish)},
		{"PATCH", path("/api/items?id=%d", wishItem)}, {"DELETE", path("/api/items?id=%d", noaIdea)},
		{"POST", path("/api/claims?itemId=%d", noaIdea)}, {"PUT", path("/api/share?listId=%d", wish)},
		{"POST", path("/api/share/rotate?listId=%d", wish)}, {"POST", path("/api/members/link?listId=%d", mom)},
	} {
		expectCode(t, call(t, max, c.method, c.target, map[string]any{"title": "x", "enabled": true}), 404, "not_found", "stranger "+c.method+" "+c.target)
	}
	expectCode(t, call(t, max, "POST", "/api/items", map[string]any{"listId": wish, "name": "x"}), 404, "not_found", "stranger adds item")
	expectCode(t, call(t, max, "POST", "/api/occasions", map[string]any{"listId": mom, "label": "Birthday", "month": 5, "day": 3}), 404, "not_found", "stranger adds date")
	expectCode(t, call(t, max, "POST", "/api/members", map[string]any{"listId": mom, "email": max.email}), 404, "not_found", "stranger invites")

	// Lea joins Mom's list as a co-planner.
	joinPersonList(t, noa, lea, mom)
	res := expect(t, call(t, lea, "GET", path("/api/lists?id=%d", mom), nil), 200, "member reads list")
	if res.str("list", "role") != "member" || res.str("list", "owner", "name") != "Noa Brunner" {
		t.Fatalf("member view = %s", res.raw)
	}

	// Co-planner: add ideas, edit and delete their own, not others'.
	leaIdea := expect(t, call(t, lea, "POST", "/api/items", map[string]any{"listId": mom, "name": "Book", "priority": 1}), 201, "member adds idea")
	if leaIdea.str("item", "addedBy", "name") != "Lea Keller" || leaIdea.get("item", "addedBy", "isMe") != true {
		t.Fatalf("idea = %s", leaIdea.raw)
	}
	leaIdeaID := leaIdea.id("item", "id")
	expect(t, call(t, lea, "PATCH", path("/api/items?id=%d", leaIdeaID), map[string]any{"name": "Novel"}), 200, "member edits own idea")
	expectCode(t, call(t, lea, "PATCH", path("/api/items?id=%d", noaIdea), map[string]any{"name": "x"}), 403, "forbidden", "member edits owner's idea")
	expectCode(t, call(t, lea, "DELETE", path("/api/items?id=%d", noaIdea), nil), 403, "forbidden", "member deletes owner's idea")

	// Co-planner: dates, budget ticks and claims yes; list settings and invites no.
	occ := expect(t, call(t, lea, "POST", "/api/occasions", map[string]any{"listId": mom, "label": "Birthday", "month": 11, "day": 2, "budgetCents": 15000}), 201, "member adds date").id("occasion", "id")
	expect(t, call(t, lea, "PATCH", path("/api/occasions?id=%d", occ), map[string]any{"budgetCents": nil}), 200, "member clears budget")
	expect(t, call(t, lea, "PUT", "/api/picks", map[string]any{"itemId": noaIdea, "occasionId": occ, "picked": true}), 200, "member picks")
	expect(t, call(t, lea, "POST", path("/api/claims?itemId=%d", noaIdea), nil), 200, "member claims")
	expectCode(t, call(t, lea, "PATCH", path("/api/lists?id=%d", mom), map[string]any{"title": "Mama"}), 403, "forbidden", "member renames")
	expectCode(t, call(t, lea, "DELETE", path("/api/lists?id=%d", mom), nil), 403, "forbidden", "member deletes list")
	expectCode(t, call(t, lea, "POST", "/api/members", map[string]any{"listId": mom, "email": max.email}), 403, "forbidden", "member invites")
	expectCode(t, call(t, lea, "POST", path("/api/members/link?listId=%d", mom), nil), 403, "forbidden", "member makes invite link")

	// Wishlist-only and person-only actions on the wrong kind of list.
	expectCode(t, call(t, noa, "PUT", path("/api/share?listId=%d", mom), map[string]any{"enabled": true}), 404, "not_found", "share a person list")
	expectCode(t, call(t, noa, "POST", path("/api/claims?itemId=%d", wishItem), nil), 404, "not_found", "claim on a wishlist")
	expectCode(t, call(t, noa, "PUT", "/api/picks", map[string]any{"itemId": wishItem, "occasionId": occ, "picked": true}), 404, "not_found", "pick on a wishlist")
	expectCode(t, call(t, noa, "POST", "/api/members", map[string]any{"listId": wish, "email": lea.email}), 400, "invalid", "invite to a wishlist")
	expectCode(t, call(t, noa, "PATCH", path("/api/lists?id=%d", wish), map[string]any{"personNotes": []string{"x"}}), 400, "invalid", "notes on a wishlist")

	// Owner: everything on their lists, including others' ideas.
	expect(t, call(t, noa, "PATCH", path("/api/lists?id=%d", mom), map[string]any{"title": "Mama", "personFullName": "Andrea Brunner", "personNotes": []string{"Size M", " ", "Likes green"}}), 200, "owner edits list")
	res = expect(t, call(t, noa, "GET", path("/api/lists?id=%d", mom), nil), 200, "owner reads list")
	if res.str("list", "title") != "Mama" || res.str("list", "personNotes") != "[Size M Likes green]" || res.str("list", "members", "0", "status") != "active" {
		t.Fatalf("owner view = %s", res.raw)
	}
	expect(t, call(t, noa, "DELETE", path("/api/items?id=%d", leaIdeaID), nil), 204, "owner deletes member's idea")

	// Lea leaves; the list is gone for her.
	memberID := res.id("list", "members", "0", "id")
	expect(t, call(t, lea, "DELETE", path("/api/members?id=%d", memberID), nil), 204, "member leaves")
	expectCode(t, call(t, lea, "GET", path("/api/lists?id=%d", mom), nil), 404, "not_found", "former member reads list")

	// Deleting a list takes everything with it.
	expect(t, call(t, noa, "DELETE", path("/api/lists?id=%d", wish), nil), 204, "owner deletes wishlist")
	expectCode(t, call(t, noa, "GET", path("/api/lists?id=%d", wish), nil), 404, "not_found", "deleted list")
}

func TestValidation(t *testing.T) {
	needDB(t)
	noa := newUser("Noa Brunner")
	expectCode(t, call(t, noa, "POST", "/api/lists", map[string]any{"kind": "wish", "title": "   "}), 400, "invalid", "blank title")
	expectCode(t, call(t, noa, "POST", "/api/lists", map[string]any{"kind": "other", "title": "x"}), 400, "invalid", "bad kind")
	expectCode(t, call(t, noa, "POST", "/api/lists", map[string]any{"kind": "wish", "title": strings.Repeat("a", 61)}), 400, "invalid", "long title")
	wish := newList(t, noa, "wish", "  Ski   season ")
	res := expect(t, call(t, noa, "GET", path("/api/lists?id=%d", wish), nil), 200, "read")
	if res.str("list", "title") != "Ski season" || res.get("list", "occasion") != nil || res.get("list", "share", "url") != nil {
		t.Fatalf("list = %s", res.raw)
	}

	for _, body := range []map[string]any{
		{"listId": wish, "name": " "},
		{"listId": wish, "name": "x", "priceCents": -1},
		{"listId": wish, "name": "x", "priority": 4},
		{"listId": wish, "name": "x", "currency": "chf1"},
		{"listId": wish, "name": "x", "url": "javascript:alert(1)"},
		{"listId": wish, "name": "x", "imageUrl": "data:image/png;base64,AAAA"},
	} {
		expectCode(t, call(t, noa, "POST", "/api/items", body), 400, "invalid", fmt.Sprint(body))
	}

	// The store comes from the URL; creating an item never fetches it.
	res = expect(t, call(t, noa, "POST", "/api/items", map[string]any{"listId": wish, "name": "Goggles", "url": "https://WWW.Galaxus.ch:443/p/1", "currency": "eur"}), 201, "item")
	if res.str("item", "store") != "galaxus.ch" || res.str("item", "currency") != "EUR" || res.str("item", "priority") != "2" {
		t.Fatalf("item = %s", res.raw)
	}

	for _, body := range []map[string]any{
		{"listId": wish, "label": "Birthday", "month": 4, "day": 31},
		{"listId": wish, "label": "Birthday", "month": 13, "day": 1},
		{"listId": wish, "label": "Birthday", "month": 2, "day": 29, "year": 2027},
		{"listId": wish, "label": "", "month": 1, "day": 1},
	} {
		expectCode(t, call(t, noa, "POST", "/api/occasions", body), 400, "invalid", fmt.Sprint(body))
	}
	expectCode(t, call(t, noa, "GET", "/api/search?q=a", nil), 400, "invalid", "short search")
}

func TestOneOccasionPerWishlist(t *testing.T) {
	needDB(t)
	noa := newUser("Noa Brunner")
	wish := newList(t, noa, "wish", "Birthday list")
	expect(t, call(t, noa, "POST", "/api/occasions", map[string]any{"listId": wish, "label": "Birthday", "month": 2, "day": 29}), 201, "first date")
	expectCode(t, call(t, noa, "POST", "/api/occasions", map[string]any{"listId": wish, "label": "Christmas", "month": 12, "day": 24}), 409, "one_occasion", "second date")

	mom := newList(t, noa, "person", "Mom")
	expect(t, call(t, noa, "POST", "/api/occasions", map[string]any{"listId": mom, "label": "Birthday", "month": 5, "day": 3, "budgetCents": 15000}), 201, "person date 1")
	expect(t, call(t, noa, "POST", "/api/occasions", map[string]any{"listId": mom, "label": "Christmas", "month": 12, "day": 24, "year": 2099}), 201, "person date 2")
	res := expect(t, call(t, noa, "GET", path("/api/lists?id=%d", mom), nil), 200, "read")
	if n := len(res.get("list", "occasions").([]any)); n != 2 {
		t.Fatalf("occasions = %d", n)
	}
}

func TestClaimConflicts(t *testing.T) {
	needDB(t)
	noa, lea, max := newUser("Noa Brunner"), newUser("Lea Keller"), newUser("Max Muster")
	mom := newList(t, noa, "person", "Mom")
	joinPersonList(t, noa, lea, mom)
	joinPersonList(t, noa, max, mom)
	idea := newItem(t, noa, mom, "Scarf", 4900)

	res := expect(t, call(t, lea, "POST", path("/api/claims?itemId=%d", idea), nil), 200, "Lea claims")
	if res.str("item", "reservedBy", "name") != "Lea Keller" || res.get("item", "reservedBy", "isMe") != true {
		t.Fatalf("claim = %s", res.raw)
	}
	expect(t, call(t, lea, "POST", path("/api/claims?itemId=%d", idea), nil), 200, "Lea claims again (idempotent)")
	expectCode(t, call(t, max, "POST", path("/api/claims?itemId=%d", idea), nil), 409, "taken", "Max claims a taken idea")
	expectCode(t, call(t, noa, "POST", path("/api/claims?itemId=%d", idea), nil), 409, "taken", "owner claims a taken idea")

	res = expect(t, call(t, noa, "GET", path("/api/lists?id=%d", mom), nil), 200, "owner sees the claim")
	if res.str("list", "items", "0", "reservedBy", "name") != "Lea Keller" {
		t.Fatalf("owner view = %s", res.raw)
	}
	expectCode(t, call(t, max, "DELETE", path("/api/claims?itemId=%d", idea), nil), 403, "forbidden", "Max undoes Lea's claim")
	res = expect(t, call(t, noa, "DELETE", path("/api/claims?itemId=%d", idea), nil), 200, "owner clears Lea's claim")
	if res.get("item", "reservedBy") != nil {
		t.Fatalf("after clear = %s", res.raw)
	}
	expect(t, call(t, max, "POST", path("/api/claims?itemId=%d", idea), nil), 200, "Max claims")
	expect(t, call(t, max, "DELETE", path("/api/claims?itemId=%d", idea), nil), 200, "Max undoes own claim")
}

func TestShareRotateAndLinkOff(t *testing.T) {
	needDB(t)
	noa, lea := newUser("Noa Brunner"), newUser("Lea Keller")
	wish := newList(t, noa, "wish", "Ski season")
	newItem(t, noa, wish, "Goggles", 12900)

	first := shareToken(t, noa, wish)
	if len(first) != 22 {
		t.Fatalf("token %q", first)
	}
	res := expect(t, call(t, nil, "GET", "/api/public?token="+first, nil), 200, "guest opens link")
	if res.str("list", "owner", "name") != "Noa Brunner" || res.str("list", "items", "0", "status") != "free" || res.get("viewer", "signedIn") != false {
		t.Fatalf("public = %s", res.raw)
	}

	rot := expect(t, call(t, noa, "POST", path("/api/share/rotate?listId=%d", wish), nil), 200, "rotate")
	second := strings.TrimPrefix(rot.str("share", "url"), "https://wishlist.test/w/")
	if second == first || second == "" {
		t.Fatalf("rotate kept the token: %s", rot.raw)
	}
	expectCode(t, call(t, lea, "GET", "/api/public?token="+first, nil), 404, "link_off", "old link after rotate")
	expect(t, call(t, lea, "GET", "/api/public?token="+second, nil), 200, "new link")

	expect(t, call(t, noa, "PUT", path("/api/share?listId=%d", wish), map[string]any{"enabled": false}), 200, "turn off")
	expectCode(t, call(t, lea, "GET", "/api/public?token="+second, nil), 404, "link_off", "link while off")
	if again := shareToken(t, noa, wish); again != second {
		t.Fatalf("turning sharing back on changed the link: %s vs %s", again, second)
	}
	expectCode(t, call(t, nil, "GET", "/api/public?token=nope", nil), 404, "link_off", "unknown token")
}

func TestPublicReservations(t *testing.T) {
	needDB(t)
	noa, lea, max := newUser("Noa Brunner"), newUser("Lea Keller"), newUser("Max Muster")
	wish := newList(t, noa, "wish", "Ski season")
	goggles := newItem(t, noa, wish, "Goggles", 12900)
	gloves := newItem(t, noa, wish, "Gloves", 5900)
	token := shareToken(t, noa, wish)

	// Signed-in visitor reserves with their account.
	res := expect(t, call(t, lea, "POST", "/api/public/reserve", map[string]any{"token": token, "itemId": goggles}), 200, "Lea reserves")
	if res.str("item", "status") != "mine" || res.get("undoToken") != nil {
		t.Fatalf("reserve = %s", res.raw)
	}
	// Guest reserves with an email and gets an undo token.
	expectCode(t, call(t, nil, "POST", "/api/public/reserve", map[string]any{"token": token, "itemId": gloves}), 400, "invalid", "guest without email")
	res = expect(t, call(t, nil, "POST", "/api/public/reserve", map[string]any{"token": token, "itemId": gloves, "email": "guest@example.ch"}), 200, "guest reserves")
	undo, _ := res.get("undoToken").(string)
	if len(undo) != 43 {
		t.Fatalf("undo token = %s", res.raw)
	}
	expectCode(t, call(t, max, "POST", "/api/public/reserve", map[string]any{"token": token, "itemId": goggles}), 409, "taken", "Max reserves a taken item")

	// What each visitor sees.
	res = expect(t, call(t, lea, "GET", "/api/public?token="+token, nil), 200, "Lea's view")
	statuses := map[string]string{}
	for _, it := range res.get("list", "items").([]any) {
		m := it.(map[string]any)
		statuses[m["name"].(string)] = m["status"].(string)
	}
	if statuses["Goggles"] != "mine" || statuses["Gloves"] != "taken" {
		t.Fatalf("Lea sees %v", statuses)
	}
	res = expect(t, call(t, nil, "GET", "/api/public?token="+token, nil), 200, "guest view")
	if strings.Count(res.raw, `"status":"taken"`) != 2 {
		t.Fatalf("guest view = %s", res.raw)
	}

	// Lea's overview lists it under "Shared with me".
	res = expect(t, call(t, lea, "GET", "/api/overview", nil), 200, "Lea's overview")
	if res.str("shared", "0", "token") != token || res.str("shared", "0", "takenCount") != "2" || res.str("shared", "0", "mineCount") != "1" || res.str("shared", "0", "itemCount") != "2" {
		t.Fatalf("shared = %s", res.raw)
	}

	// Undo: guest with the token, Lea with her account. Nobody undoes someone else's.
	expectCode(t, call(t, nil, "DELETE", "/api/public/reserve", map[string]any{"token": token, "itemId": gloves, "undoToken": "wrong"}), 404, "not_found", "wrong undo token")
	expectCode(t, call(t, max, "DELETE", "/api/public/reserve", map[string]any{"token": token, "itemId": goggles}), 404, "not_found", "Max undoes Lea's")
	res = expect(t, call(t, nil, "DELETE", "/api/public/reserve", map[string]any{"token": token, "itemId": gloves, "undoToken": undo}), 200, "guest undo")
	if res.str("item", "status") != "free" {
		t.Fatalf("after undo = %s", res.raw)
	}
	expect(t, call(t, lea, "DELETE", "/api/public/reserve", map[string]any{"token": token, "itemId": goggles}), 200, "Lea undo")

	// Turning sharing off hides it from "Shared with me".
	expect(t, call(t, noa, "PUT", path("/api/share?listId=%d", wish), map[string]any{"enabled": false}), 200, "off")
	res = expect(t, call(t, lea, "GET", "/api/overview", nil), 200, "Lea's overview")
	if n := len(res.get("shared").([]any)); n != 0 {
		t.Fatalf("shared after off = %s", res.raw)
	}
}

func TestInvites(t *testing.T) {
	needDB(t)
	noa, lea, max := newUser("Noa Brunner"), newUser("Lea Keller"), newUser("Max Muster")
	mom := newList(t, noa, "person", "Mom")

	inv := expect(t, call(t, noa, "POST", "/api/members", map[string]any{"listId": mom, "email": strings.ToUpper(lea.email)}), 201, "invite")
	if inv.get("emailSent") != false || inv.str("member", "status") != "invited" || inv.str("member", "email") != lea.email ||
		!strings.HasPrefix(inv.str("inviteUrl"), "https://wishlist.test/invite/") {
		t.Fatalf("invite = %s", inv.raw)
	}
	token := strings.TrimPrefix(inv.str("inviteUrl"), "https://wishlist.test/invite/")
	expectCode(t, call(t, noa, "POST", "/api/members", map[string]any{"listId": mom, "email": noa.email}), 400, "invalid", "invite yourself")
	expectCode(t, call(t, noa, "POST", "/api/members", map[string]any{"listId": mom, "email": "not-an-email"}), 400, "invalid", "bad email")

	prev := expect(t, call(t, max, "GET", "/api/invite?token="+token, nil), 200, "preview")
	if prev.str("listTitle") != "Mom" || prev.str("invitedBy", "name") != "Noa Brunner" || prev.get("alreadyMember") != false {
		t.Fatalf("preview = %s", prev.raw)
	}
	expectCode(t, call(t, max, "POST", "/api/invite/accept", map[string]any{"token": token}), 403, "forbidden", "wrong person accepts a personal invite")
	expectCode(t, call(t, noa, "POST", "/api/invite/accept", map[string]any{"token": token}), 400, "invalid", "owner accepts")
	res := expect(t, call(t, lea, "POST", "/api/invite/accept", map[string]any{"token": token}), 200, "Lea accepts")
	if res.id("listId") != mom {
		t.Fatalf("accept = %s", res.raw)
	}
	expectCode(t, call(t, lea, "POST", "/api/invite/accept", map[string]any{"token": token}), 404, "not_found", "personal invites work once")
	expectCode(t, call(t, noa, "POST", "/api/members", map[string]any{"listId": mom, "email": lea.email}), 400, "invalid", "invite an active member")

	// The reusable link: anyone signed in. Making a new one retires the old one.
	link := expect(t, call(t, noa, "POST", path("/api/members/link?listId=%d", mom), nil), 200, "link").str("inviteUrl")
	newer := expect(t, call(t, noa, "POST", path("/api/members/link?listId=%d", mom), nil), 200, "new link").str("inviteUrl")
	expectCode(t, call(t, max, "GET", "/api/invite?token="+strings.TrimPrefix(link, "https://wishlist.test/invite/"), nil), 404, "not_found", "old reusable link")
	expect(t, call(t, max, "POST", "/api/invite/accept", map[string]any{"token": strings.TrimPrefix(newer, "https://wishlist.test/invite/")}), 200, "Max accepts the link")
	prev = expect(t, call(t, max, "GET", "/api/invite?token="+strings.TrimPrefix(newer, "https://wishlist.test/invite/"), nil), 200, "preview again")
	if prev.get("alreadyMember") != true {
		t.Fatalf("preview = %s", prev.raw)
	}

	// Lea's overview shows the list as a member, with Noa and Max as co-planners.
	res = expect(t, call(t, lea, "GET", "/api/overview", nil), 200, "Lea's overview")
	if res.str("people", "0", "role") != "member" || res.str("people", "0", "coPlanners", "0", "name") != "Noa Brunner" || len(res.get("people", "0", "coPlanners").([]any)) != 2 {
		t.Fatalf("people = %s", res.raw)
	}
}

func TestOverviewAndSearch(t *testing.T) {
	needDB(t)
	noa := newUser("Noa Brunner")
	wish := newList(t, noa, "wish", "Ski season")
	for _, name := range []string{"Goggles", "Gloves", "Helmet", "Socks", "Wax"} {
		newItem(t, noa, wish, name, 1000)
	}
	mom := newList(t, noa, "person", "Mom")
	occ := expect(t, call(t, noa, "POST", "/api/occasions", map[string]any{"listId": mom, "label": "Birthday", "month": 5, "day": 3, "budgetCents": 15000}), 201, "date").id("occasion", "id")
	scarf := newItem(t, noa, mom, "Scarf", 4900)
	tea := newItem(t, noa, mom, "Tea set", 2990)
	expect(t, call(t, noa, "POST", "/api/items", map[string]any{"listId": mom, "name": "Bag", "priceCents": 9000, "currency": "EUR"}), 201, "EUR idea")
	for _, id := range []int64{scarf, tea} {
		expect(t, call(t, noa, "PUT", "/api/picks", map[string]any{"itemId": id, "occasionId": occ, "picked": true}), 200, "pick")
	}

	res := expect(t, call(t, noa, "GET", "/api/overview", nil), 200, "overview")
	if res.str("lists", "0", "itemCount") != "5" || len(res.get("lists", "0", "previews").([]any)) != 4 || res.get("lists", "0", "shared") != false {
		t.Fatalf("lists = %s", res.raw)
	}
	key := fmt.Sprint(occ)
	if res.str("people", "0", "pickedCentsByOccasion", key) != "7890" || res.str("people", "0", "pickedCountByOccasion", key) != "2" ||
		res.str("people", "0", "ideaCount") != "3" || res.str("people", "0", "role") != "owner" {
		t.Fatalf("people = %s", res.raw)
	}

	res = expect(t, call(t, noa, "GET", "/api/search?q=GLO", nil), 200, "search")
	if res.str("items", "0", "name") != "Gloves" || res.str("items", "0", "listTitle") != "Ski season" {
		t.Fatalf("search = %s", res.raw)
	}
	res = expect(t, call(t, noa, "GET", "/api/search?q=mo", nil), 200, "search lists")
	if res.str("lists", "0", "title") != "Mom" || res.str("lists", "0", "kind") != "person" {
		t.Fatalf("search = %s", res.raw)
	}
	res = expect(t, call(t, noa, "GET", "/api/search?q=%25%25", nil), 200, "search for %%")
	if len(res.get("items").([]any))+len(res.get("lists").([]any)) != 0 {
		t.Fatalf("%% wasn't escaped: %s", res.raw)
	}
	other := newUser("Max Muster")
	res = expect(t, call(t, other, "GET", "/api/search?q=Gloves", nil), 200, "someone else searches")
	if len(res.get("items").([]any)) != 0 {
		t.Fatalf("search leaks other users' items: %s", res.raw)
	}
}

// TestOwnerNeverSeesReservations is the privacy rule: nothing the owner of a wishlist can call
// says anything about its reservations. Every owner response is captured before and after friends
// reserve, and must be byte-for-byte the same and free of reservation signals.
func TestOwnerNeverSeesReservations(t *testing.T) {
	needDB(t)
	noa, lea := newUser("Noa Brunner"), newUser("Lea Keller")
	wish := newList(t, noa, "wish", "Ski season")
	expect(t, call(t, noa, "POST", "/api/occasions", map[string]any{"listId": wish, "label": "Birthday", "month": 11, "day": 2}), 201, "date")
	goggles := newItem(t, noa, wish, "Goggles", 12900)
	gloves := newItem(t, noa, wish, "Gloves", 5900)
	newItem(t, noa, wish, "Helmet", 19900)
	token := shareToken(t, noa, wish)

	ownerViews := func() map[string]string {
		out := map[string]string{}
		for _, target := range []string{
			path("/api/lists?id=%d", wish),
			"/api/overview",
			"/api/public?token=" + token,
			"/api/search?q=Go",
			"/api/me",
		} {
			out[target] = expect(t, call(t, noa, "GET", target, nil), 200, "owner GET "+target).raw
		}
		return out
	}
	before := ownerViews()

	expect(t, call(t, lea, "POST", "/api/public/reserve", map[string]any{"token": token, "itemId": goggles}), 200, "Lea reserves")
	expect(t, call(t, nil, "POST", "/api/public/reserve", map[string]any{"token": token, "itemId": gloves, "email": "secret.guest@example.ch"}), 200, "guest reserves")

	after := ownerViews()
	// Writes the owner makes return the item or list too.
	after["PATCH item"] = expect(t, call(t, noa, "PATCH", path("/api/items?id=%d", goggles), map[string]any{"note": "Size L"}), 200, "owner edits a reserved item").raw
	after["POST item"] = expect(t, call(t, noa, "POST", "/api/items", map[string]any{"listId": wish, "name": "Poles"}), 201, "owner adds").raw
	after["PATCH list"] = expect(t, call(t, noa, "PATCH", path("/api/lists?id=%d", wish), map[string]any{"title": "Ski season"}), 200, "owner renames").raw
	after["PUT share"] = expect(t, call(t, noa, "PUT", path("/api/share?listId=%d", wish), map[string]any{"enabled": true}), 200, "owner shares").raw
	// The owner can't use the visitor actions to probe: same answer for reserved and free items.
	for _, id := range []int64{goggles, gloves} {
		expectCode(t, call(t, noa, "POST", "/api/public/reserve", map[string]any{"token": token, "itemId": id}), 403, "forbidden", "owner reserves")
		expectCode(t, call(t, noa, "DELETE", "/api/public/reserve", map[string]any{"token": token, "itemId": id}), 403, "forbidden", "owner unreserves")
		expectCode(t, call(t, noa, "POST", path("/api/claims?itemId=%d", id), nil), 404, "not_found", "owner claims")
		expectCode(t, call(t, noa, "DELETE", path("/api/claims?itemId=%d", id), nil), 404, "not_found", "owner unclaims")
	}

	for target, raw := range before {
		if after[target] != raw {
			t.Errorf("owner's %s changed after friends reserved:\nbefore %s\nafter  %s", target, raw, after[target])
		}
	}
	signals := regexp.MustCompile(`(?i)reserv|taken|"mine"|"free"|undo|secret\.guest|` + lea.id + `|Lea Keller`)
	for target, raw := range after {
		if m := signals.FindString(raw); m != "" {
			t.Errorf("owner's %s contains %q: %s", target, m, raw)
		}
		if strings.Contains(raw, `"status"`) && strings.Count(raw, `"status":"hidden"`) != strings.Count(raw, `"status"`) {
			t.Errorf("owner's %s has a status other than hidden: %s", target, raw)
		}
	}
}
