# Data model · Wishlist v2

SQL: `migrations/0002_wishlist_v2.sql`. Tested on PostgreSQL 16:
- on a fresh database
- on today's `pkg/db/schema.sql` with legacy rows (wishlists with and without `auth_user_id`, a reserved item, an out-of-range priority, a blank name, URLs with `www.`, ports and query strings)
- run twice in a row: the second run changes nothing

```
profiles ─────────────── one row per Supabase user (display name cache)

lists ──┬── occasions ──┐        kind = 'wish' | 'person'
        │               │
        ├── items ──────┼── item_picks (item × occasion, person lists)
        │     └── reservations (0..1 per item)
        ├── list_members  (co-planners, person lists)
        └── list_followers (signed-in visitors of a share link → "Shared with me")
```

| Table | What it holds | Notes |
|---|---|---|
| `profiles` | `user_id`, `email`, `display_name` | Upserted on every authenticated request. Used for "Noa Brunner's wishlist", "Lea is getting this", avatar initials. |
| `lists` | owner, kind, title, person name and notes, share flag and token, invite token hash | Check constraints keep person fields on person lists, sharing on wishlists and invites on person lists. `legacy_wishlist_id` links rows copied from v1. |
| `occasions` | label, month, day, optional year, optional budget | `year IS NULL` = yearly. Wishlists: max 1 (API rule). |
| `items` | name, url, image, store host, note, price cents + currency, priority, added_by | Same table for wishlist items and person-list ideas. Priority is unused on person lists. |
| `item_picks` | (item, occasion) | Budget ticks. Sum of picked prices per occasion = "CHF 96.– of 150.–". |
| `reservations` | item, source, reserver user or email, undo token hash | One per item. `source`: `web` (share link), `member` (co-planner claim), `legacy` (old `reserved = true`). |
| `list_members` | list, email, user, status, personal invite token hash | Owner isn't a row. `invited` → `active` on accept. |
| `list_followers` | list, user | Written when a signed-in non-owner opens `/w/:token`. Hide the list from "Shared with me" when sharing is off. |

## Derived values (compute, don't store)

- **Next occurrence** of an occasion: the next `month/day` on or after today in `Europe/Zurich` (or the given year if set; past one-off dates drop out). Feb 29 → Feb 28 in non-leap years. Put this in one place per side: `pkg/app/dates.go` and `src/lib/format.ts`, with the same test cases.
- **Coming up**: occasions within 70 days across owned and member person lists, own wishlists and followed lists.
- **Picked total**: `SUM(items.price_cents)` over `item_picks` for that occasion. Mixed currencies: sum CHF only and show a small "+ other currencies" note (rare, keep simple).
- **Store**: host of `url`, lowercase, without `www.` and port.

## Tokens

| Token | Format | Stored as |
|---|---|---|
| share token | 16 random bytes, base64url | plain in `lists.share_token` (it's in the URL anyway; rotating replaces it) |
| guest undo token | 32 random bytes, base64url | sha256 hex in `reservations.undo_token_hash` |
| personal invite | 32 random bytes, base64url | sha256 hex in `list_members.invite_token_hash` |
| reusable invite link | 32 random bytes, base64url | sha256 hex in `lists.invite_token_hash` |

## Legacy tables

`users`, `wishlists`, `wishlist_items` stay untouched and are only read by migration 0002. Drop them in a later migration once v2 has run in production for a while. Not part of this work.
