package auth

import (
	"errors"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const CookieName = "planary_wishlist_session"

type Claims struct {
	UserID int64 `json:"userId"`
	jwt.RegisteredClaims
}

func secret() ([]byte, error) {
	value := os.Getenv("JWT_SECRET")
	if value == "" {
		return nil, errors.New("JWT_SECRET is required")
	}
	return []byte(value), nil
}

func Issue(userID int64) (string, error) {
	key, err := secret()
	if err != nil {
		return "", err
	}

	claims := Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   strconv.FormatInt(userID, 10),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(key)
}

func Parse(tokenString string) (int64, error) {
	key, err := secret()
	if err != nil {
		return 0, err
	}

	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (any, error) {
		return key, nil
	})
	if err != nil {
		return 0, err
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return 0, errors.New("invalid session")
	}

	return claims.UserID, nil
}

func SetCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   secureCookies(),
		MaxAge:   7 * 24 * 60 * 60,
	})
}

func ClearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   secureCookies(),
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	})
}

func UserIDFromRequest(r *http.Request) (int64, error) {
	cookie, err := r.Cookie(CookieName)
	if err != nil {
		return 0, err
	}
	return Parse(cookie.Value)
}

func secureCookies() bool {
	if os.Getenv("COOKIE_SECURE") == "false" {
		return false
	}
	return os.Getenv("VERCEL") == "1" || os.Getenv("VERCEL_ENV") != ""
}
