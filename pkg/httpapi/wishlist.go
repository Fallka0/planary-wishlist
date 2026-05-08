package httpapi

import (
	"net/http"
	"strconv"

	"planary-wishlist/pkg/app"
	"planary-wishlist/pkg/auth"
	"planary-wishlist/pkg/httpx"
	"planary-wishlist/pkg/models"
)

type createItemRequest struct {
	Name       string `json:"name"`
	URL        string `json:"url"`
	Notes      string `json:"notes"`
	PriceCents int64  `json:"priceCents"`
	Priority   int    `json:"priority"`
}

type updateItemRequest struct {
	Reserved bool `json:"reserved"`
}

func Wishlist(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		httpx.Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	sharedUser, ok := requireUser(w, r)
	if !ok {
		return
	}

	wishlist, err := app.GetWishlist(r.Context(), sharedUser.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load wishlist")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{"wishlist": wishlist})
}

func WishlistItems(w http.ResponseWriter, r *http.Request) {
	sharedUser, ok := requireUser(w, r)
	if !ok {
		return
	}

	switch r.Method {
	case http.MethodPost:
		var payload createItemRequest
		if err := httpx.DecodeJSON(r, &payload); err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid request body")
			return
		}

		item, err := app.CreateWishlistItem(r.Context(), sharedUser.ID, models.WishlistItem{
			Name:       payload.Name,
			URL:        payload.URL,
			Notes:      payload.Notes,
			PriceCents: payload.PriceCents,
			Priority:   payload.Priority,
		})
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, err.Error())
			return
		}

		httpx.JSON(w, http.StatusCreated, map[string]any{"item": item})
	case http.MethodPatch:
		itemID, err := parseItemID(r)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "valid item id is required")
			return
		}

		var payload updateItemRequest
		if err := httpx.DecodeJSON(r, &payload); err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid request body")
			return
		}

		item, err := app.UpdateWishlistItemReservation(r.Context(), sharedUser.ID, itemID, payload.Reserved)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, err.Error())
			return
		}

		httpx.JSON(w, http.StatusOK, map[string]any{"item": item})
	case http.MethodDelete:
		itemID, err := parseItemID(r)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "valid item id is required")
			return
		}

		if err := app.DeleteWishlistItem(r.Context(), sharedUser.ID, itemID); err != nil {
			httpx.Error(w, http.StatusBadRequest, err.Error())
			return
		}

		w.WriteHeader(http.StatusNoContent)
	default:
		httpx.Error(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func Health(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		httpx.Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func requireUser(w http.ResponseWriter, r *http.Request) (auth.User, bool) {
	user, err := auth.UserFromRequest(r)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "not authenticated")
		return auth.User{}, false
	}
	return user, true
}

func parseItemID(r *http.Request) (int64, error) {
	return strconv.ParseInt(r.URL.Query().Get("id"), 10, 64)
}
