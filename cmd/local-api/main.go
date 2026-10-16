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

	mux := httpapi.Mux()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("local api listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}
