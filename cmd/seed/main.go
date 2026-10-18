// Command seed fills a database with the prototype's demo data (docs/wishlist-v2/prototype:
// LISTS, PEOPLE, SHARED) for one Planary user, so the app can be compared with the screenshots.
//
//	go run ./cmd/seed -user <uuid> [-email noa@example.ch] [-name "Noa Brunner"] [-reset]
//
// It reads DATABASE_URL (or .env) and runs the migrations first. Three demo friends (Matteo, Lea,
// Jonas) get fixed ids from demoFriends; they can't sign in, they only own the "Shared with me"
// lists and appear as co-planners. -reset deletes the user's lists and the demo friends' lists
// the user follows before seeding again.
package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"regexp"
	"strings"
	"time"

	"planary-wishlist/pkg/db"

	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
)

type person struct{ id, email, name string }

var (
	matteo = person{"00000000-0000-4000-8000-00000000de01", "matteo.keller@example.ch", "Matteo Keller"}
	lea    = person{"00000000-0000-4000-8000-00000000de02", "lea.brunner@example.ch", "Lea Brunner"}
	jonas  = person{"00000000-0000-4000-8000-00000000de03", "jonas.brunner@example.ch", "Jonas Brunner"}

	demoFriends = []person{matteo, lea, jonas}
)

type item struct {
	name, store string
	price       int64 // cents
	priority    int   // 1 must have, 2 would love, 3 nice to have
	note        string
	reservedBy  string // wishlists: "guest", "me" or ""
}

type idea struct {
	name, store string
	price       int64
	addedBy     *person // nil = the user
	picked      bool    // counts toward the first occasion's budget
	claimedBy   *person // nil = nobody; &me = the user
}

type occasion struct {
	label      string
	month, day int
	budget     int64 // cents, 0 = none
}

type wishlist struct {
	title    string
	shared   bool
	occasion *occasion
	items    []item
}

type personList struct {
	title, fullName string
	notes           []string
	occasions       []occasion
	ideas           []idea
	planners        []*person // first joined, the rest invited
}

// me stands for the user being seeded in idea.addedBy/claimedBy.
var me = &person{}

var wishlists = []wishlist{
	{"Birthday", true, &occasion{"Birthday", 5, 24, 0}, []item{
		{"Over-ear noise-cancelling headphones", "digitec.ch", 34900, 1, "Black, not silver", ""},
		{"Instant film camera", "galaxus.ch", 12900, 1, "", "guest"},
		{"Field watch, 38 mm", "galaxus.ch", 24500, 2, "Green dial if they still have it", ""},
		{"Trail running shoes", "zalando.ch", 15995, 2, "Size 42", ""},
		{"Leather card holder", "manor.ch", 5990, 2, "Dark brown", ""},
		{"Wireless game controller", "interdiscount.ch", 6995, 3, "", ""},
		{"Ceramic pour-over set", "galaxus.ch", 6400, 3, "White or sand", "guest"},
		{"Desk lamp with dimmer", "ikea.ch", 4995, 3, "", ""},
		{"Klara and the Sun, paperback", "orellfuessli.ch", 1990, 3, "", ""},
	}},
	{"New flat", false, nil, []item{
		{"Two-seat sofa, light grey", "ikea.ch", 69900, 1, "Max. 180 cm wide", ""},
		{"Olive tree, 120 cm", "galaxus.ch", 8900, 2, "", ""},
		{"Floor lamp, linen shade", "manor.ch", 14900, 2, "", ""},
		{"Cast-iron pan, 28 cm", "galaxus.ch", 7900, 2, "", ""},
		{"Espresso cups, set of 4", "galaxus.ch", 3490, 3, "", ""},
		{"Bookshelf, oak", "ikea.ch", 12900, 3, "", ""},
	}},
	{"Someday", false, nil, []item{
		{"Chronograph, panda dial", "chrono24.ch", 145000, 3, "Saving up for this one", ""},
		{"Full-frame mirrorless camera", "digitec.ch", 219900, 3, "", ""},
		{"Weekend bag, waxed canvas", "zalando.ch", 18900, 3, "", ""},
		{"Handheld game console", "interdiscount.ch", 34900, 3, "", ""},
	}},
	{"Christmas", false, &occasion{"Christmas", 12, 25, 0}, nil},
}

var people = []personList{
	{"Mom", "Andrea Brunner",
		[]string{"Tops in M, shoes in 38", "Loves olive green and linen, not purple", "Already has a Nespresso machine and an e-reader"},
		[]occasion{{"Birthday", 11, 2, 15000}, {"Christmas", 12, 25, 10000}},
		[]idea{
			{"Linen scarf, olive", "manor.ch", 5900, &lea, true, &lea},
			{"Herb garden starter kit", "galaxus.ch", 3700, nil, true, me},
			{"Pottery evening for two", "mydays.ch", 8900, &lea, false, nil},
			{"Vegetable cookbook", "orellfuessli.ch", 3490, nil, false, nil},
			{"Reading lamp, brass", "ikea.ch", 3995, &jonas, false, nil},
			{"Silk pillowcase", "manor.ch", 4900, nil, false, nil},
		},
		[]*person{&lea, &jonas}},
	{"Lea", "Lea Brunner", nil,
		[]occasion{{"Christmas", 12, 25, 8000}},
		[]idea{
			{"Chalk bag", "bergzeit.ch", 2990, nil, true, nil},
			{"Film rolls, pack of 5", "galaxus.ch", 5400, nil, false, nil},
			{"Climbing gym, 10-entry card", "", 15000, nil, false, nil},
		}, nil},
	{"Jonas", "Jonas Brunner", nil,
		[]occasion{{"Christmas", 12, 25, 6000}},
		[]idea{
			{"Board game for 2–4 players", "galaxus.ch", 4900, nil, false, nil},
			{"Wool beanie", "zalando.ch", 2995, nil, false, nil},
		}, nil},
	{"Grandpa Ruedi", "Ruedi Brunner", nil,
		[]occasion{{"Birthday", 1, 19, 5000}},
		[]idea{{"Garden kneeler with handles", "jumbo.ch", 3490, nil, false, nil}}, nil},
}

// Lists friends shared with the user ("Shared with me"). The user follows both.
var shared = []struct {
	owner person
	list  wishlist
}{
	{matteo, wishlist{"Matteo turns 30", true, &occasion{"Matteo turns 30", 11, 14, 0}, []item{
		{"Record player", "digitec.ch", 29900, 1, "", ""},
		{"Espresso grinder", "galaxus.ch", 18900, 1, "", "guest"},
		{"Hiking backpack, 30 l", "bergzeit.ch", 13900, 2, "Dark colours please", "me"},
		{"Cast-iron pan, 26 cm", "galaxus.ch", 6900, 2, "", "guest"},
		{"Board game for 2–4 players", "galaxus.ch", 4900, 3, "", ""},
		{"Wool beanie, navy", "zalando.ch", 2995, 3, "", ""},
	}}},
	{lea, wishlist{"Lea’s wishlist", true, nil, []item{
		{"Climbing shoes", "bergzeit.ch", 16900, 1, "", ""},
		{"Film camera, 35 mm", "galaxus.ch", 11900, 2, "", ""},
		{"Linen bedding set", "manor.ch", 12900, 3, "", ""},
		{"Canvas tote bag", "zalando.ch", 3900, 3, "", ""},
	}}},
}

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func main() {
	userID := flag.String("user", "", "Planary user id (UUID) to seed the demo data for")
	email := flag.String("email", "noa@example.ch", "email for the user's profile, if they have none yet")
	name := flag.String("name", "Noa Brunner", "display name for the user's profile, if they have none yet")
	reset := flag.Bool("reset", false, "delete the user's lists (and followed demo lists) first")
	flag.Parse()
	if !uuidRe.MatchString(*userID) {
		fmt.Fprintln(os.Stderr, "usage: go run ./cmd/seed -user <uuid> [-email …] [-name …] [-reset]")
		os.Exit(2)
	}
	_ = godotenv.Load()

	ctx := context.Background()
	pool, err := db.Pool(ctx)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	user := person{strings.ToLower(*userID), *email, *name}
	if err := seed(ctx, tx, user, *reset); err != nil {
		log.Fatalf("seed: %v", err)
	}
	if err := tx.Commit(ctx); err != nil {
		log.Fatal(err)
	}
	log.Printf("seeded the demo data for %s", user.id)
}

func seed(ctx context.Context, tx pgx.Tx, user person, reset bool) error {
	friendIDs := make([]string, len(demoFriends))
	for i, f := range demoFriends {
		friendIDs[i] = f.id
	}
	var owned int
	if err := tx.QueryRow(ctx, "SELECT COUNT(*) FROM lists WHERE owner_id = $1", user.id).Scan(&owned); err != nil {
		return err
	}
	if owned > 0 && !reset {
		return errors.New("this user already has lists; pass -reset to replace them with the demo data")
	}
	if reset {
		if _, err := tx.Exec(ctx, `
DELETE FROM lists WHERE owner_id = $1
   OR (owner_id = ANY($2::uuid[]) AND id IN (SELECT list_id FROM list_followers WHERE user_id = $1))`,
			user.id, friendIDs); err != nil {
			return err
		}
	}

	// Profiles: the user keeps theirs if they have one; the demo friends are always refreshed.
	if _, err := tx.Exec(ctx, `
INSERT INTO profiles (user_id, email, display_name) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING`,
		user.id, user.email, user.name); err != nil {
		return err
	}
	for _, f := range demoFriends {
		if _, err := tx.Exec(ctx, `
INSERT INTO profiles (user_id, email, display_name) VALUES ($1, $2, $3)
ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name`,
			f.id, f.email, f.name); err != nil {
			return err
		}
	}

	for pos, w := range wishlists {
		if _, err := addWishlist(ctx, tx, user.id, pos, w, user.id); err != nil {
			return err
		}
	}
	for pos, p := range people {
		if err := addPersonList(ctx, tx, user, pos, p); err != nil {
			return err
		}
	}
	for _, s := range shared {
		listID, err := addWishlist(ctx, tx, s.owner.id, 0, s.list, user.id)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, "INSERT INTO list_followers (list_id, user_id) VALUES ($1, $2)", listID, user.id); err != nil {
			return err
		}
	}
	return nil
}

// addWishlist creates a wishlist. Reservations marked "me" are made by viewerID, "guest" by an email.
func addWishlist(ctx context.Context, tx pgx.Tx, ownerID string, pos int, w wishlist, viewerID string) (int64, error) {
	var token any
	if w.shared {
		token = randomToken()
	}
	var listID int64
	if err := tx.QueryRow(ctx, `
INSERT INTO lists (owner_id, kind, title, position, share_enabled, share_token) VALUES ($1, 'wish', $2, $3, $4, $5)
RETURNING id`, ownerID, w.title, pos, w.shared, token).Scan(&listID); err != nil {
		return 0, err
	}
	if w.occasion != nil {
		if _, err := addOccasion(ctx, tx, listID, *w.occasion); err != nil {
			return 0, err
		}
	}
	for i, it := range w.items {
		itemID, err := addItem(ctx, tx, listID, i, it.name, it.store, it.price, it.priority, it.note, ownerID)
		if err != nil {
			return 0, err
		}
		switch it.reservedBy {
		case "guest":
			_, err = tx.Exec(ctx, "INSERT INTO reservations (item_id, source, email) VALUES ($1, 'web', $2)",
				itemID, fmt.Sprintf("guest%d@example.ch", itemID))
		case "me":
			_, err = tx.Exec(ctx, "INSERT INTO reservations (item_id, source, user_id) VALUES ($1, 'web', $2)", itemID, viewerID)
		}
		if err != nil {
			return 0, err
		}
	}
	return listID, nil
}

func addPersonList(ctx context.Context, tx pgx.Tx, user person, pos int, p personList) error {
	var listID int64
	if err := tx.QueryRow(ctx, `
INSERT INTO lists (owner_id, kind, title, person_full_name, person_notes, position) VALUES ($1, 'person', $2, $3, $4, $5)
RETURNING id`, user.id, p.title, p.fullName, strings.Join(p.notes, "\n"), pos).Scan(&listID); err != nil {
		return err
	}
	var firstOccasion int64
	for i, o := range p.occasions {
		id, err := addOccasion(ctx, tx, listID, o)
		if err != nil {
			return err
		}
		if i == 0 {
			firstOccasion = id
		}
	}
	for i, pl := range p.planners {
		status, userID, joined := "active", any(pl.id), any(time.Now())
		if i > 0 {
			status, userID, joined = "invited", nil, nil
		}
		if _, err := tx.Exec(ctx, `
INSERT INTO list_members (list_id, email, user_id, status, invited_by, joined_at) VALUES ($1, $2, $3, $4, $5, $6)`,
			listID, pl.email, userID, status, user.id, joined); err != nil {
			return err
		}
	}
	for i, d := range p.ideas {
		by := user.id
		if d.addedBy != nil {
			by = d.addedBy.id
		}
		itemID, err := addItem(ctx, tx, listID, i, d.name, d.store, d.price, 2, "", by)
		if err != nil {
			return err
		}
		if d.picked && firstOccasion != 0 {
			if _, err := tx.Exec(ctx, "INSERT INTO item_picks (item_id, occasion_id) VALUES ($1, $2)", itemID, firstOccasion); err != nil {
				return err
			}
		}
		if d.claimedBy != nil {
			claimer := user.id
			if d.claimedBy != me {
				claimer = d.claimedBy.id
			}
			if _, err := tx.Exec(ctx, "INSERT INTO reservations (item_id, source, user_id) VALUES ($1, 'member', $2)", itemID, claimer); err != nil {
				return err
			}
		}
	}
	return nil
}

func addOccasion(ctx context.Context, tx pgx.Tx, listID int64, o occasion) (int64, error) {
	var budget any
	if o.budget > 0 {
		budget = o.budget
	}
	var id int64
	err := tx.QueryRow(ctx, `
INSERT INTO occasions (list_id, label, month, day, budget_cents) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		listID, o.label, o.month, o.day, budget).Scan(&id)
	return id, err
}

// addItem adds an item; i keeps the prototype's order (newest first means the first item is newest).
func addItem(ctx context.Context, tx pgx.Tx, listID int64, i int, name, store string, price int64, priority int, note, addedBy string) (int64, error) {
	url := ""
	if store != "" {
		url = "https://www." + store + "/"
	}
	var id int64
	err := tx.QueryRow(ctx, `
INSERT INTO items (list_id, name, url, store, price_cents, priority, note, added_by, created_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() - make_interval(mins => $9)) RETURNING id`,
		listID, name, url, store, price, priority, note, addedBy, i).Scan(&id)
	return id, err
}

func randomToken() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}
