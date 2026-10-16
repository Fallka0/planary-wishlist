// Package mail sends the few emails Wishlist needs: co-planner invites and guests' undo links.
// Delivery is off unless RESEND_API_KEY is set; callers then show or copy the link instead.
package mail

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

type Message struct {
	To      string
	Subject string
	Text    string
}

type Sender interface {
	// Enabled reports whether Send actually delivers anything.
	Enabled() bool
	Send(ctx context.Context, m Message) error
}

// FromEnv returns the Resend sender when RESEND_API_KEY is set, otherwise a no-op.
func FromEnv() Sender {
	key := os.Getenv("RESEND_API_KEY")
	if key == "" {
		return NoOp{}
	}
	from := os.Getenv("MAIL_FROM")
	if from == "" {
		from = "Planary <noreply@planary.ch>"
	}
	return resend{key: key, from: from}
}

// NoOp delivers nothing.
type NoOp struct{}

func (NoOp) Enabled() bool                       { return false }
func (NoOp) Send(context.Context, Message) error { return nil }

type resend struct{ key, from string }

func (resend) Enabled() bool { return true }

func (r resend) Send(ctx context.Context, m Message) error {
	body, _ := json.Marshal(map[string]any{"from": r.from, "to": m.To, "subject": m.Subject, "text": m.Text})
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+r.key)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("resend responded %s", resp.Status)
	}
	return nil
}
