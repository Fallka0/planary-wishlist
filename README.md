# Planary Wishlist

Wishlists for the things you want, and private gift-idea lists for the people you buy for. Paste a product link and the app reads its name, picture and price; share a wishlist by link and friends tap "I'll get this", while **you never find out what's reserved**.

Team project under the Planary brand, where I was the lead developer.

**Live:** [wishlist.planary.ch](https://wishlist.planary.ch)

![Go](https://img.shields.io/badge/Go-00ADD8?logo=go&logoColor=white) ![React](https://img.shields.io/badge/React-20232A?logo=react) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)

## Features

- **Wishlists**: as many as you like. Add by link (the API reads Open Graph tags, JSON-LD and price hints, behind an SSRF guard) or by hand; priority, note, filters, sort, rows or grid, totals in CHF. Remove has a 5-second Undo.
- **Sharing**: one link per wishlist, which can be switched off or replaced. Friends reserve without an account (email, with an undo link) or with their Planary account, and the list then shows under "Shared with me".
- **Privacy rule**: a wishlist's owner never sees reservations, not even indirectly. The server enforces it and an integration test (`TestOwnerNeverSeesReservations`) checks every response the owner can get.
- **Gift ideas**: a private list per person with ideas, dates with countdowns, a budget per date filled by ticking ideas, and notes like sizes. Invite co-planners by email or link; they add ideas and say "I'll get this", and everyone sees who's getting what.
- **Overview**: what's coming up in the next ten weeks, your wishlists, gift ideas and lists shared with you, plus search across all of them.
- Sign-in with the shared Planary account (auth.planary.ch). Light and dark themes, phone layouts, keyboard and screen-reader support.

The design and the decisions behind v2 are in [`docs/wishlist-v2/`](docs/wishlist-v2/README.md).

## Architecture

```
src/
  app/            shell: frame, top bar, sidebar, search, new-list dialog, routes
  pages/          one component per route (overview, wishlist, person, shared, public, invite)
  items/          add dialog (link preview) and edit drawer
  lists/          share, rename, date and delete dialogs
  people/         plan-together and person-list dialogs
  shared/         a shared wishlist as friends see it, reserve and undo dialogs
  ui/             primitives (Button, Field, Dialog, Menu, Toast, …), CSS Modules
  lib/            API client, session, formatting, occasions, theme
  styles/         design tokens and the global reset
api/router.go     the one Vercel Go function; vercel.json sends all /api/* here
pkg/
  auth/           planary-auth token check (cached briefly), display name
  db/             connection pool and migrations runner
    migrations/   numbered SQL files, applied in order on the first request
  app/            business logic, permissions and SQL; link preview with SSRF guard
  httpapi/        HTTP handlers and the route table (+ integration tests)
  httpx/          JSON helpers
  mail/           invite and undo emails (off unless RESEND_API_KEY is set)
  models/         JSON response types (mirror docs/wishlist-v2/api/api-types.ts)
cmd/local-api/    local Go server for development (same handlers as api/)
cmd/seed/         demo data from the design prototype, for one user
docs/wishlist-v2/ design and implementation handoff for v2
```

**API**: specified in [`docs/wishlist-v2/api/API.md`](docs/wishlist-v2/api/API.md). Every route is listed once in `pkg/httpapi/routes.go`. `cmd/local-api` serves that table directly; on Vercel, `vercel.json` rewrites every `/api/*` request to the single function `api/router.go`, which dispatches through the same table. One function instead of one per route keeps the deployment under the Hobby plan's limit of 12 functions. Permissions are checked in SQL (owner, or an active co-planner), and anything you may not see is a 404.

**Migrations**: every file in `pkg/db/migrations` runs once, in its own transaction behind an advisory lock, and is recorded in `schema_migrations`. Add a new numbered file for any schema change; never edit one that has shipped.

**Frontend**: Vite, React 19, react-router 7 and TanStack Query; styling is design tokens plus CSS Modules, no component library. Pages use container queries (1100 px and 760 px) so dialogs and the shell share one set of breakpoints.

## What I learned

The code worked, but the product did not take off: we built before checking clearly enough what problem it solves for users. Since then I start projects by defining the use case first.

## Environment

Copy `.env.example` to `.env`. The Go side reads it in `cmd/local-api` and `cmd/seed`; on Vercel, set the same names in the project settings.

| Variable | Used by | What it is |
|---|---|---|
| `DATABASE_URL` | API, seed | Postgres connection string. Migrations run on the first request. |
| `AUTH_API_URL` | API | planary-auth, which confirms sign-in tokens. Defaults to `https://auth.planary.ch`. |
| `PUBLIC_APP_URL` | API | Base for share and invite links. Falls back to the request's host. |
| `RESEND_API_KEY`, `MAIL_FROM` | API | Optional email for invites and guests' undo links. Unset = no email; the app copies the links instead. |
| `DATABASE_URL_TEST` | tests | A Postgres URL whose user can create databases. The integration tests make and drop their own. |
| `VITE_AUTH_BASE_URL` | frontend | Where sign-in lives. Defaults to `https://auth.planary.ch`; its allowed return origins must include this app. |
| `VITE_API_BASE_URL` | frontend | Optional; defaults to the same origin. |

## Run locally

```bash
npm install
cp .env.example .env              # set DATABASE_URL
npm run api:dev                   # Go API on :8080
npm run dev                       # frontend on :5376, proxies /api to :8080
```

Sign-in goes through auth.planary.ch, so your local origin has to be in its allowed return origins. To see the app filled in like the design, seed the demo data for your Planary user id (shown by `GET /api/me`):

```bash
npm run seed -- -user <your-user-id>           # refuses if you already have lists
npm run seed -- -user <your-user-id> -reset    # replaces your lists with the demo data
```

## Tests

```bash
npm run test                      # frontend unit tests (vitest)
npx tsc --noEmit                  # types
npm run test:go                   # go vet + go test; set DATABASE_URL_TEST to include the database tests
```

CI (`.github/workflows/ci.yaml`) runs all of these on every pull request, with a Postgres service, so the integration tests, including the privacy test, always run.
