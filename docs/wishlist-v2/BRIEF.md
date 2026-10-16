# Brief · Planary Wishlist v2

You're rebuilding the app in this repo (`Fallka0/planary-wishlist`) to match a finished design. Everything you need is in this folder. Read this file fully, then `SCREENS.md`, `design/DESIGN.md`, `api/API.md` and `DATA-MODEL.md`, and look at the screenshots before writing code.

## 1. The product in one paragraph

Planary Wishlist does two jobs. **Wishlists** are lists of things *you* want: paste a product link, the app reads name, picture and price, and you share a link. Friends open it without an account and tap "I'll get this", and **you never find out what's reserved**. **Gift ideas** are private lists about *someone else* (Mom, a friend): ideas, their birthday and other dates with a countdown, a budget per occasion, notes like sizes, and optional co-planners (siblings) who can add ideas and claim them. The person themselves never sees it. Sign-in is the shared Planary account (auth.planary.ch, Supabase).

## 2. What exists today (verified in the repo)

- **Backend:** Go 1.24, `pgx` on Postgres. The **live code is `pkg/`**: `api/**.go` (Vercel functions) and `cmd/local-api` both import `planary-wishlist/pkg/...`. **`internal/` is an older copy** with its own users/passwords auth. Nothing outside `internal/` imports it. `pkg/auth/session.go` (JWT cookies, `JWT_SECRET`, `COOKIE_SECURE`) is the same leftover and is never called.
- **Auth:** `pkg/auth/supabase.go` validates the bearer token against `SUPABASE_URL/auth/v1/user`. `/api/auth/register` and `/login` return 410 and point to auth.planary.ch. Wishlists are keyed by `auth_user_id UUID`.
- **DB:** `pkg/db/schema.sql` is embedded and executed on the first pool use (idempotent DDL, no versioning). One wishlist per user. `wishlist_items.reserved` is a flag the **owner** toggles and sees. That breaks the new privacy rule.
- **Link preview:** `pkg/app/link_preview.go` (OG tags, JSON-LD, price hints) runs **inside item creation**. It fetches any URL from the server without an SSRF guard.
- **Frontend:** Vite 7, React 19, react-router 7, TypeScript, supabase-js. Everything is in one 539-line `src/App.tsx` plus a 721-line "Glass Design System" `src/styles.css`, with `react-bits` text effects and `motion`. The app also contains its own marketing landing page.
- **Deploy:** one Vercel project (static frontend + Go functions, SPA rewrite in `vercel.json`).
- **README** describes `internal/` and the old JWT login, so it's out of date.

## 3. Target

- Design: 29 screens in `screenshots/` (light, dark, phone). Static HTML of each in `prototype/static/`. Interactive source in `prototype/wishlist-app.dc.html` (how to read it: `prototype/README.md`).
- Data model: `DATA-MODEL.md` + `migrations/0002_wishlist_v2.sql` (tested on Postgres 16 against the current schema with legacy rows; safe to re-run).
- API: `api/API.md` + `api/api-types.ts`.
- Tokens and icons: `design/tokens.css`, `design/icons.ts`.

## 4. Decisions already made (don't reopen)

1. Two list kinds in one `lists` table: `wish` and `person`. Many of each per user.
2. **Wishlist owners never see reservations.** No status, no count, nothing. Enforced server-side and tested.
3. Person lists: co-planners see and make claims ("Lea is getting this"). A budget per occasion, filled by ticking ideas ("picks").
4. Guests reserve with an email and get an undo token. Signed-in visitors reserve with their account, and the list then shows under "Shared with me".
5. Link preview becomes its own endpoint, called by the Add dialog before saving. Item creation no longer fetches URLs.
6. Stack stays: Vite + React 19 + react-router 7 + TS on the front, Go + pgx on Vercel functions on the back. Add `@tanstack/react-query` (server state), `@fontsource/unbounded` + `@fontsource/manrope`, `vitest`. Styling = `design/tokens.css` + CSS Modules. No Tailwind, no component library.
7. Remove: `internal/`, `pkg/auth/session.go`, the in-app landing page (marketing lives on planary.ch/wishlist), `react-bits`, `motion`, the glass styles and unused assets.
8. Routes: `/` → `/app` when signed in, else redirect to auth.planary.ch with `returnTo`. `/app`, `/app/lists/:id`, `/app/people/:id`, `/app/shared/:token`, `/w/:token` (public, no auth), `/invite/:token` (needs auth, then accept).
9. Money in integer cents + currency; Swiss formatting (`CHF 349.–`, `CHF 1’146.65`).
10. Theme: light/dark via tokens, follows the system until the user toggles. Stored in `localStorage["planary-theme"]` and `<html data-theme>`.

## 5. Open questions (defaults given: build the default, keep it easy to change)

| # | Question | Default |
|---|---|---|
| 1 | Email delivery for co-planner invites and guest undo links? | **Off in v1.** Behind `RESEND_API_KEY`: when unset, invites show/copy the link ("Invite link copied. Send it to …") and guest undo works from the same browser. Write a small `pkg/mail` interface with a no-op implementation. |
| 2 | Public domain for share links? | Env `PUBLIC_APP_URL` (e.g. `https://wishlist.planary.ch`). Fall back to the request host. |
| 3 | Which `user_metadata` key holds the Planary display name? | Try `display_name`, `full_name`, `name`, else the email local part. One function, easy to change. |
| 4 | Product images are hotlinked from shops. | Hotlink with `referrerPolicy="no-referrer"`, `loading="lazy"`; on error, show the fallback tile. No proxy in v1. |
| 5 | Search scope? | `GET /api/search` as in API.md: titles and item names, owner/member lists only. |

## 6. Plan

Work on branch `wishlist-v2`. **Stop after each phase**: summarise what changed, how to test it, and anything you had to decide. Wait for Nick's go before the next phase. Commit at least once per phase.

### Phase 0 · Groundwork
- Delete `internal/` and `pkg/auth/session.go`. Fix the README architecture section.
- Migrations runner in `pkg/db`: embed `migrations/*.sql`, table `schema_migrations(version TEXT PRIMARY KEY, applied_at)`, apply missing files in order inside a transaction with `pg_advisory_xact_lock`. `0001_initial.sql` = today's `pkg/db/schema.sql` verbatim. `0002_wishlist_v2.sql` = the file in this folder.
- Profiles upsert on authenticated requests (open question 3).
- Tooling: `vitest` set up, `go vet ./...` and `go test ./...` clean. Add `npm run test`.
- **Done when:** a fresh DB and a DB with the old schema + data both migrate; re-running is a no-op; the app still starts.

### Phase 1 · API
- Implement every endpoint in `api/API.md` in `pkg/app` (logic + SQL) and `pkg/httpapi` (HTTP), registered in `api/` and `cmd/local-api`.
- Link preview endpoint with the SSRF guard. Remove fetching from item creation.
- Tests:
  - unit: SSRF guard (private/loopback/IPv6/redirect cases), store-from-URL, price parsing, token hashing
  - integration (skipped when `DATABASE_URL_TEST` is unset): permission matrix, claim conflicts (409), one occasion per wishlist, share rotate invalidates old token
- **Done when:** all routes respond per contract, tests pass, and an owner request to any endpoint never includes reservation data (assert on the raw JSON).

### Phase 2 · Frontend foundation
- `src/styles/tokens.css` (from `design/tokens.css`), fonts via @fontsource, global reset, skip link.
- `src/lib/`: `api.ts` (typed client from `api-types.ts`, keeps the Supabase bearer logic), `format.ts` (`formatMoney`, `formatDate`, `nextOccurrence`, `daysUntil`, pluralise) with vitest tests, React Query setup.
- Primitives in `src/ui/`: Button, IconButton, Icon (from `icons.ts`), Field, PriceField, Chip, Segmented, Switch, Tag, Avatar, AvatarStack, Tile, ProgressBar, Dialog (focus trap, Esc, bottom sheet under 760 px), Drawer, Toast (with optional Undo), Skeleton.
- App shell: top bar, sidebar, phone menu sheet, theme toggle, routing (§4.8), auth redirect.
- **Done when:** the shell matches `WL-Home` / `WL-Phone-Menu` with an empty main area, in both themes.

### Phase 3 · Wishlists
- Overview (all sections; "Coming up" may only show wishlist and person occasions until phase 5), wishlist page (rows + grid, filters, sort, totals), Add dialog (all five states), Edit drawer (with Undo on remove), Share dialog, New list dialog, empty wishlist state.
- **Done when:** you can create a wishlist, add by link (real preview), by hand and via the failed path, edit, remove + undo, toggle and rotate sharing. Screens match `WL-List`, `WL-Add-*`, `WL-Edit`, `WL-Share`, `WL-New`, `WL-Empty-List`.

### Phase 4 · Gift ideas
- Person page: ideas, picks, claims, filters; occasions box (add/edit/delete with month/day picker, optional year, budget); budget box; notes editor; Plan together dialog; `/invite/:token` accept flow.
- **Done when:** two accounts can plan one person's gifts together: invite, accept, both add ideas, claims show the right names, budget sums update. Matches `WL-Person`, `WL-Invite`.

### Phase 5 · Sharing and reservations
- `/w/:token` public page (guest reserve dialog, undo from localStorage and `?undo=`), signed-in reserve, owner preview banner, "link off" page, `/app/shared/:token`, "Shared with me" in sidebar and overview, the remaining "Coming up" cases.
- **The privacy test:** an integration test that creates a wishlist, reserves items as a guest and as another user, then calls every endpoint the owner can reach (`/api/overview`, `/api/lists`, `/api/public` as owner, `/api/search`) and fails if any response contains a reservation signal.
- **Done when:** matches `WL-Public`, `WL-Public-Reserve`, `WL-Visit`; the privacy test passes.

### Phase 6 · Polish
- First-run screen, phone pass on every screen at 375 px, dark pass, keyboard and screen-reader pass (DESIGN.md checklist), reduced motion.
- **Visual check:** seed the demo data from the prototype (`LISTS`, `PEOPLE`, `SHARED` in the prototype script) with a `cmd/seed` command for a given user id, screenshot each route at 1440 and 375 with Playwright, and compare side by side with `screenshots/`. List the differences you kept on purpose.
- Update README (features, architecture, env vars, run locally).

## 7. Rules for this work

- Match the screenshots and `SCREENS.md` copy. If something is missing from the design (search popover, link-off page, owner banner), build it in the same vocabulary and mention it in your phase summary.
- Don't add features beyond this brief. Put ideas in a "Later" list in the phase summary.
- Keep handlers thin: SQL and rules live in `pkg/app`, HTTP in `pkg/httpapi`.
- Every list query filters by permission in SQL (`owner_id = $user OR EXISTS member`), never by filtering in Go after loading.
- No secrets in code. New env vars go in `.env.example` with a comment: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DATABASE_URL`, `DATABASE_URL_TEST`, `PUBLIC_APP_URL`, `RESEND_API_KEY` (optional), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_AUTH_BASE_URL`, `VITE_API_BASE_URL` (optional, defaults to same origin).
- `JWT_SECRET` (in `.env.example`) and `COOKIE_SECURE` belong to the dead cookie auth: remove them with phase 0.
- Commit messages in English, imperative.

## 8. Not in scope

Native apps, price tracking or alerts, reminder emails for occasions, currency conversion, drag-to-reorder (the `position` columns exist for later), comments on items, importing from other wishlist services, a Planary-wide notification centre.
