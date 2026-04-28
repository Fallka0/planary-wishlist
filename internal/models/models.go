package models

import "time"

type User struct {
	ID        int64     `json:"id"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"createdAt"`
}

type Wishlist struct {
	ID        int64          `json:"id"`
	UserID    int64          `json:"-"`
	Title     string         `json:"title"`
	CreatedAt time.Time      `json:"createdAt"`
	Items     []WishlistItem `json:"items"`
}

type WishlistItem struct {
	ID         int64     `json:"id"`
	WishlistID int64     `json:"wishlistId"`
	Name       string    `json:"name"`
	URL        string    `json:"url"`
	Notes      string    `json:"notes"`
	PriceCents int64     `json:"priceCents"`
	Priority   int       `json:"priority"`
	Reserved   bool      `json:"reserved"`
	CreatedAt  time.Time `json:"createdAt"`
}
