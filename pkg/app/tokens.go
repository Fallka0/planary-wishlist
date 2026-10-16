package app

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
)

// newToken returns n random bytes as unpadded base64url.
func newToken(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err) // crypto/rand never fails on supported platforms
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

// Share tokens are 16 bytes and stored as is. Undo and invite tokens are 32 bytes and stored hashed.
func newShareToken() string  { return newToken(16) }
func newSecretToken() string { return newToken(32) }

// hashToken is how undo and invite tokens are stored: sha256, hex.
func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
