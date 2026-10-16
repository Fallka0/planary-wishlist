# Planary Wishlist

A full-stack wishlist app: create an account, build wishlists and add items by pasting a product link. The Go backend fetches the page and fills in title, image and price automatically.

Team project under the Planary brand, where I was the lead developer.

**Live:** [planary-wishlist.vercel.app](https://planary-wishlist.vercel.app)

![Go](https://img.shields.io/badge/Go-00ADD8?logo=go&logoColor=white) ![React](https://img.shields.io/badge/React-20232A?logo=react) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)

## Features

- Sign-in with the shared Planary account (auth.planary.ch, Supabase). The API checks the bearer token against Supabase.
- Wishlists and items stored in Postgres
- **Link preview:** paste a URL and the backend reads Open Graph tags, JSON-LD and price hints from the page
- Frontend and Go API deployed together as one Vercel project, so no CORS setup is needed

Version 2 is being built from the handoff in [`docs/wishlist-v2/`](docs/wishlist-v2/README.md).

## Architecture

```
src/              React + Vite frontend
api/              Vercel Go function entrypoints, one per route
pkg/
  auth/           Supabase bearer-token check, display name
  db/             connection pool and migrations runner
    migrations/   numbered SQL files, applied in order on the first request
  app/            business logic, permissions and SQL; link preview with SSRF guard
  httpapi/        HTTP handlers and the route table
  httpx/          JSON helpers
  mail/           invite and undo emails (off unless RESEND_API_KEY is set)
  models/         JSON response types (mirror docs/wishlist-v2/api/api-types.ts)
cmd/local-api/    local Go server for development (same handlers as api/)
docs/wishlist-v2/ design and implementation handoff for v2
```

API: the v2 endpoints are specified in [`docs/wishlist-v2/api/API.md`](docs/wishlist-v2/api/API.md). Every route is listed once in `pkg/httpapi/routes.go` (served by `cmd/local-api`) and has a one-line entrypoint under `api/` for Vercel; a test fails if the two drift apart. The v1 routes (`/api/wishlist`, `/api/auth/*`) stay until the v2 frontend ships.

Migrations: every file in `pkg/db/migrations` runs once, in its own transaction behind an advisory lock, and is recorded in `schema_migrations`. Add a new numbered file for any schema change; never edit one that has shipped.

## What I learned

The code worked, but the product did not take off: we built before checking clearly enough what problem it solves for users. Since then I start projects by defining the use case first.

## Run locally

```bash
npm install
cp .env.example .env    # set DATABASE_URL and the Supabase keys
npm run api:dev         # Go API on :8080
npm run dev             # frontend, proxies /api to :8080
```

Tests:

```bash
npm run test            # frontend (vitest)
npm run test:go         # go vet + go test; set DATABASE_URL_TEST to include the database tests
```
