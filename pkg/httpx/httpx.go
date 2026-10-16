package httpx

import (
	"encoding/json"
	"net/http"
)

func JSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

// Error is the v1 error shape: {"error": message}.
func Error(w http.ResponseWriter, status int, message string) {
	JSON(w, status, map[string]string{"error": message})
}

// ErrorCode is the v2 error shape: {"error": message, "code": code}.
func ErrorCode(w http.ResponseWriter, status int, code, message string) {
	JSON(w, status, map[string]string{"error": message, "code": code})
}

func NoContent(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNoContent)
}

func DecodeJSON(r *http.Request, destination any) error {
	return json.NewDecoder(r.Body).Decode(destination)
}
