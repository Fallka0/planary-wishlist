package main

import (
	"log"
	"net/http"
	"os"

	"planary-wishlist/pkg/httpapi"

	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", httpapi.Health)
	mux.HandleFunc("/api/auth/register", httpapi.Register)
	mux.HandleFunc("/api/auth/login", httpapi.Login)
	mux.HandleFunc("/api/auth/logout", httpapi.Logout)
	mux.HandleFunc("/api/auth/me", httpapi.Me)
	mux.HandleFunc("/api/wishlist", httpapi.Wishlist)
	mux.HandleFunc("/api/wishlist/items", httpapi.WishlistItems)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("local api listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}
