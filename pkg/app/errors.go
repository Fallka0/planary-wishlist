package app

import "net/http"

// Error is a failure the caller may see: an HTTP status, a machine code from API.md and a message for the UI.
type Error struct {
	Status  int
	Code    string
	Message string
	Store   string // only for "unreadable" link previews
}

func (e *Error) Error() string { return e.Message }

func invalid(message string) *Error {
	return &Error{Status: http.StatusBadRequest, Code: "invalid", Message: message}
}

// errNotFound covers anything the caller may not see, so it never reveals that a list exists.
var errNotFound = &Error{Status: http.StatusNotFound, Code: "not_found", Message: "We couldn't find that."}

func forbidden(message string) *Error {
	return &Error{Status: http.StatusForbidden, Code: "forbidden", Message: message}
}

var (
	errTaken       = &Error{Status: http.StatusConflict, Code: "taken", Message: "Someone else is already getting this."}
	errOneOccasion = &Error{Status: http.StatusConflict, Code: "one_occasion", Message: "A wishlist can have one date."}
	errLinkOff     = &Error{Status: http.StatusNotFound, Code: "link_off", Message: "This link doesn't work anymore."}
	errRateLimited = &Error{Status: http.StatusTooManyRequests, Code: "rate_limited", Message: "Too many reservations from here. Try again in an hour."}
)
