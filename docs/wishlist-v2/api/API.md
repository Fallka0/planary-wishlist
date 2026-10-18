# API contract · Wishlist v2

Types: `api-types.ts` (same folder). The Go handlers in `pkg/httpapi` must produce exactly those JSON shapes (camelCase).

## Conventions

- Same style as today: one Vercel Go function per file under `api/`, ids in the query string (`?id=12`), JSON bodies, errors as `{"error": "...", "code": "..."}` via `pkg/httpx`.
- Auth: `Authorization: Bearer <Supabase access token>`, checked by `pkg/auth.UserFromRequest` as now. Every authenticated request also upserts `profiles` (email + display name from Supabase `user_metadata`, see BRIEF open question 3).
- Register every route in **both** `api/…/*.go` (Vercel) and `cmd/local-api/main.go` (local dev).
- Money is integer cents + ISO currency. Never floats.
- `404` for anything the caller may not see (don't reveal that a list exists).
- Validation errors are `400` with `code: "invalid"` and a message written for the UI.

## Permission matrix

| Action | Wishlist owner | Person-list owner | Active co-planner | Signed-in visitor (share link) | Guest (share link) |
|---|---|---|---|---|---|
| Read list + items | ✓ (no reservations) | ✓ | ✓ | public view | public view |
| Add / edit / delete items | ✓ | ✓ all | add; edit/delete own | – | – |
| Rename, notes, delete list | ✓ | ✓ | – | – | – |
| Occasions, budget | ✓ (max 1) | ✓ | ✓ | – | – |
| Picks (budget ticks) | – | ✓ | ✓ | – | – |
| Claim "I'll get this" | – | ✓ | ✓ | – | – |
| Reserve via link | ✗ never | – | – | ✓ | ✓ (email) |
| Share link on/off/rotate | ✓ | – | – | – | – |
| Invite / remove co-planners | – | ✓ | – | – | – |

**Privacy rule (hard):** no response to a wishlist's owner may contain anything derived from `reservations` for that list. That includes counts, `status` other than `hidden`, timestamps, and side effects like ordering. There's a test for this (BRIEF, phase 5).

## Endpoints

### Session
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/me` | – | `{ me: Profile }` (replaces `/api/auth/me`; keep the old path as an alias until the frontend ships) |

### Search
| GET | `/api/search?q=` | – | `SearchResponse` |
|---|---|---|---|

Case-insensitive substring match (`ILIKE`) on list titles, person full names and item names across everything the user can see as owner or member (not shared-with-me lists). Max 5 lists + 10 items. `q` at least 2 characters.

### Overview
| GET | `/api/overview` | – | `OverviewResponse` |
|---|---|---|---|

Lists sorted by `position, created_at`. `people` includes person lists the user owns **and** ones they're an active member of (`role` tells which). `shared` = `list_followers` rows for lists whose share link is still enabled.

### Lists
| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/lists` | `{ kind, title }` | `201 { list: ListDetail }` |
| GET | `/api/lists?id=` | – | `{ list: ListDetail }` |
| PATCH | `/api/lists?id=` | `{ title?, personFullName?, personNotes?: string[] }` | `{ list: ListDetail }` |
| DELETE | `/api/lists?id=` | – | `204` |

`title` 1–60 chars. `personNotes` max 20 lines × 200 chars, stored joined with `\n`.

### Items (wishlist items and person-list ideas)
| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/items` | `{ listId, name, url?, imageUrl?, store?, note?, priceCents?, currency?, priority? }` | `201 { item: WishItem \| Idea }` |
| PATCH | `/api/items?id=` | any of the create fields except `listId` | `{ item }` |
| DELETE | `/api/items?id=` | – | `204` |

- `name` required (1–200). The client fills it from the link preview, so **creating an item never fetches the URL anymore**. Remove the fetch from `CreateWishlistItem`.
- `store` is derived server-side from `url` when not given (host, lowercase, no `www.`).
- `priority` is ignored on person lists.

### Link preview
| POST | `/api/link-preview` | `{ url }` | `200 { preview: LinkPreview }` or `422 { error, code: "unreadable", store }` |
|---|---|---|---|

Wraps the existing `fetchLinkMetadata` (`pkg/app/link_preview.go`). Requirements:
- **SSRF guard** (missing today): only `http`/`https`, ports 80/443, resolve the host and reject loopback, private, link-local, CGNAT and multicast ranges (v4 + v6), re-check on every redirect, max 3 redirects. Use a custom `net.Dialer.Control` so DNS rebinding can't slip through.
- 8 s total timeout, 2 MB body cap (exists), HTML only (exists).
- Currency: read `priceCurrency` from JSON-LD / `product:price:currency` meta; default CHF.
- `422 unreadable` when no title could be found. The UI then shows the "We couldn't read details from <store>" state and keeps the URL.
- Auth required (no open proxy).

### Occasions
| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/occasions` | `{ listId, label, month, day, year?, budgetCents? }` | `201 { occasion }` |
| PATCH | `/api/occasions?id=` | same fields, partial | `{ occasion }` |
| DELETE | `/api/occasions?id=` | – | `204` |

Wishlists: max one occasion (`409 code: "one_occasion"`). Validate the day against the month (Feb 29 allowed; it counts down to Feb 28 in non-leap years).

### Picks (budget ticks on person lists)
| PUT | `/api/picks` | `{ itemId, occasionId, picked: boolean }` | `{ item: Idea }` |
|---|---|---|---|

### Claims (person lists: "I'll get this" between co-planners)
| Method | Path | Response |
|---|---|---|
| POST | `/api/claims?itemId=` | `{ item: Idea }`, `409 code: "taken"` if someone else has it |
| DELETE | `/api/claims?itemId=` | `{ item: Idea }`. Only your own claim; the list owner can clear anyone's |

Stored in `reservations` with `source = 'member'`.

### Sharing (wishlists)
| Method | Path | Body | Response |
|---|---|---|---|
| PUT | `/api/share?listId=` | `{ enabled }` | `{ share: ShareState }` |
| POST | `/api/share/rotate?listId=` | – | `{ share: ShareState }` |

Token: 16 random bytes, base64url (no padding). First enable creates it. Disabling keeps the token, so re-enabling brings the same link back; rotate replaces it and old links 404.

### Public page (no auth required, auth optional)
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/public?token=` | – | `PublicListResponse` |
| POST | `/api/public/reserve` | `{ token, itemId, email? }` | `ReserveResponse`; `409 code: "taken"` |
| DELETE | `/api/public/reserve` | `{ token, itemId, undoToken? }` | `{ item: PublicItem }` |

- Token unknown or sharing off → `404 code: "link_off"` (UI: "This link doesn't work anymore").
- Signed-in non-owner viewer: upsert `list_followers` (this fills "Shared with me"). `status` is `mine` for their own reservations.
- Guest: `email` required for reserving. Response carries `undoToken` (32 random bytes base64url); store only its sha256 in `reservations.undo_token_hash`. When email delivery is on, also mail a link `/w/<token>?undo=<undoToken>&item=<itemId>` (BRIEF open question 1; the page needs the item id for the DELETE).
- Guests see their own reservations as `taken`; the client upgrades them to `mine` from the undo tokens in localStorage.
- **Owner viewing their own link:** `viewer.isOwner = true` and every item has `status: "hidden"`. The page shows a banner instead of reserve buttons.
- Simple abuse guard: max 20 reservations per IP per hour (an in-memory map is fine on Vercel; best effort).

### Co-planners (person lists)
| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/members` | `{ listId, email }` | `201 InviteResponse` |
| DELETE | `/api/members?id=` | – | `204` (owner removes anyone; a member can remove themselves = leave) |
| POST | `/api/members/link?listId=` | – | `{ inviteUrl }`: reusable link for "Copy invite link" (rotates `lists.invite_token_hash`) |
| GET | `/api/invite?token=` | – | `InvitePreview` |
| POST | `/api/invite/accept` | `{ token }` | `{ listId }`, then the client navigates to `/app/people/:listId` |

Invite tokens: 32 random bytes base64url, store sha256 only. A personal invite binds to the email on accept only if the signed-in email matches (case-insensitive); the reusable list link accepts anyone signed in. The list owner can't accept their own invite.

## Error codes

`invalid` · `not_found` · `taken` · `one_occasion` · `unreadable` · `link_off` · `rate_limited` · `forbidden` (only where 404 would confuse, e.g. editing someone else's idea on a shared list)
