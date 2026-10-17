// Package models holds the JSON shapes the API returns. The v2 types mirror
// docs/wishlist-v2/api/api-types.ts field for field.
package models

import "time"

type Profile struct {
	ID          string `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
	Initials    string `json:"initials"`
}

type PersonRef struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Initials string `json:"initials"`
	IsMe     bool   `json:"isMe"`
}

type Occasion struct {
	ID          int64  `json:"id"`
	Label       string `json:"label"`
	Month       int    `json:"month"`
	Day         int    `json:"day"`
	Year        *int   `json:"year"`
	BudgetCents *int64 `json:"budgetCents"`
}

// WishItem is an item on the owner's own wishlist. It deliberately has no reservation fields.
type WishItem struct {
	ID         int64     `json:"id"`
	ListID     int64     `json:"listId"`
	Name       string    `json:"name"`
	URL        string    `json:"url"`
	ImageURL   string    `json:"imageUrl"`
	Store      string    `json:"store"`
	Note       string    `json:"note"`
	PriceCents int64     `json:"priceCents"`
	Currency   string    `json:"currency"`
	Priority   int       `json:"priority"`
	CreatedAt  time.Time `json:"createdAt"`
}

// Idea is an item on a person list, as seen by the owner and co-planners.
type Idea struct {
	ID         int64      `json:"id"`
	ListID     int64      `json:"listId"`
	Name       string     `json:"name"`
	URL        string     `json:"url"`
	ImageURL   string     `json:"imageUrl"`
	Store      string     `json:"store"`
	Note       string     `json:"note"`
	PriceCents int64      `json:"priceCents"`
	Currency   string     `json:"currency"`
	AddedBy    PersonRef  `json:"addedBy"`
	ReservedBy *PersonRef `json:"reservedBy"`
	PickedFor  []int64    `json:"pickedFor"`
	CreatedAt  time.Time  `json:"createdAt"`
}

// Item statuses on the public page. "hidden" is only ever sent to the list owner.
const (
	StatusFree   = "free"
	StatusTaken  = "taken"
	StatusMine   = "mine"
	StatusHidden = "hidden"
)

// PublicItem is an item on a shared wishlist, as seen by a visitor.
type PublicItem struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	URL        string `json:"url"`
	ImageURL   string `json:"imageUrl"`
	Store      string `json:"store"`
	Note       string `json:"note"`
	PriceCents int64  `json:"priceCents"`
	Currency   string `json:"currency"`
	Priority   int    `json:"priority"`
	Status     string `json:"status"`
}

type ShareState struct {
	Enabled bool    `json:"enabled"`
	URL     *string `json:"url"`
}

type WishListDetail struct {
	ID       int64      `json:"id"`
	Kind     string     `json:"kind"` // always "wish"
	Title    string     `json:"title"`
	Occasion *Occasion  `json:"occasion"`
	Share    ShareState `json:"share"`
	Items    []WishItem `json:"items"`
}

type Member struct {
	ID     int64      `json:"id"`
	User   *PersonRef `json:"user"`
	Email  string     `json:"email"`
	Status string     `json:"status"`
}

type PersonListDetail struct {
	ID             int64      `json:"id"`
	Kind           string     `json:"kind"` // always "person"
	Title          string     `json:"title"`
	PersonFullName string     `json:"personFullName"`
	PersonNotes    []string   `json:"personNotes"`
	Occasions      []Occasion `json:"occasions"`
	Role           string     `json:"role"`
	Owner          PersonRef  `json:"owner"`
	Members        []Member   `json:"members"`
	Items          []Idea     `json:"items"`
}

type ImagePreview struct {
	ImageURL string `json:"imageUrl"`
	Store    string `json:"store"`
}

type WishListSummary struct {
	ID        int64          `json:"id"`
	Title     string         `json:"title"`
	ItemCount int            `json:"itemCount"`
	Shared    bool           `json:"shared"`
	Occasion  *Occasion      `json:"occasion"`
	Previews  []ImagePreview `json:"previews"`
}

type PersonSummary struct {
	ID                    int64           `json:"id"`
	Title                 string          `json:"title"`
	PersonFullName        string          `json:"personFullName"`
	IdeaCount             int             `json:"ideaCount"`
	Occasions             []Occasion      `json:"occasions"`
	PickedCentsByOccasion map[int64]int64 `json:"pickedCentsByOccasion"`
	PickedCountByOccasion map[int64]int   `json:"pickedCountByOccasion"`
	CoPlanners            []PersonRef     `json:"coPlanners"`
	Role                  string          `json:"role"`
}

type SharedSummary struct {
	ListID     int64     `json:"listId"`
	Token      string    `json:"token"`
	Title      string    `json:"title"`
	Owner      PersonRef `json:"owner"`
	ItemCount  int       `json:"itemCount"`
	TakenCount int       `json:"takenCount"`
	MineCount  int       `json:"mineCount"`
	Occasion   *Occasion `json:"occasion"`
}

type OverviewResponse struct {
	Me     Profile           `json:"me"`
	Lists  []WishListSummary `json:"lists"`
	People []PersonSummary   `json:"people"`
	Shared []SharedSummary   `json:"shared"`
}

type LinkPreview struct {
	URL        string `json:"url"`
	Store      string `json:"store"`
	Title      string `json:"title"`
	ImageURL   string `json:"imageUrl"`
	PriceCents int64  `json:"priceCents"`
	Currency   string `json:"currency"`
}

type PublicList struct {
	Title    string       `json:"title"`
	Owner    PersonRef    `json:"owner"`
	Occasion *Occasion    `json:"occasion"`
	Items    []PublicItem `json:"items"`
}

type Viewer struct {
	SignedIn bool `json:"signedIn"`
	IsOwner  bool `json:"isOwner"`
}

type PublicListResponse struct {
	List   PublicList `json:"list"`
	Viewer Viewer     `json:"viewer"`
}

type ReserveResponse struct {
	Item      PublicItem `json:"item"`
	UndoToken *string    `json:"undoToken"`
}

type InviteResponse struct {
	Member    Member `json:"member"`
	InviteURL string `json:"inviteUrl"`
	EmailSent bool   `json:"emailSent"`
}

type InvitePreview struct {
	ListTitle     string    `json:"listTitle"`
	InvitedBy     PersonRef `json:"invitedBy"`
	AlreadyMember bool      `json:"alreadyMember"`
}

type SearchList struct {
	ID    int64  `json:"id"`
	Kind  string `json:"kind"`
	Title string `json:"title"`
}

type SearchItem struct {
	ID        int64  `json:"id"`
	ListID    int64  `json:"listId"`
	ListKind  string `json:"listKind"`
	ListTitle string `json:"listTitle"`
	Name      string `json:"name"`
}

type SearchResponse struct {
	Lists []SearchList `json:"lists"`
	Items []SearchItem `json:"items"`
}
