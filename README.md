# Planary Wishlist

Wishlists for the things you want, and private gift-idea lists for the people you buy for. Paste a product link and the app reads its name, picture and price; share a wishlist by link and friends tap "I'll get this", while **you never find out what's reserved**.

Team project under the Planary brand, where I was the lead developer.

**Live:** [wishlist.planary.ch](https://wishlist.planary.ch)

![React](https://img.shields.io/badge/React-20232A?logo=react) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white) ![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?logo=cloudflareworkers&logoColor=white) ![SQLite](https://img.shields.io/badge/D1_(SQLite)-003B57?logo=sqlite&logoColor=white)

## Features

- **Wishlists**: as many as you like. Add by link (the API reads Open Graph tags, JSON-LD and price hints, behind an SSRF guard) or by hand; priority, note, filters, sort, rows or grid, totals in CHF. Remove has a 5-second Undo.
- **Sharing**: one link per wishlist, which can be switched off or replaced. Friends reserve without an account (email, with an undo link) or with their Planary account, and the list then shows under "Shared with me".
- **Privacy rule**: a wishlist's owner never sees reservations, not even indirectly. The server enforces it and an integration test ("never shows a wishlist owner its reservations" in `worker/test/api.test.ts`) checks every response the owner can get.
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
worker/           the Cloudflare Worker: serves the built app and the API under /api
  src/            Hono routes (index.ts), permissions, SQL and rules per area, link preview
  migrations/     numbered SQL files for D1
  test/           integration tests on a local D1, unit tests
  scripts/seed.mjs  demo data from the design prototype, for one user
docs/wishlist-v2/ design and implementation handoff for v2
```

**Hosting**: one Cloudflare Worker serves wishlist.planary.ch. Requests for `/api/*` run the API; everything else is a file from the built app, or `index.html` for the app's own routes. Data lives in D1 (SQLite). Sign-in tokens from auth.planary.ch are confirmed by asking planary-auth over a service binding, worker to worker, and cached for five minutes.

**API**: specified in [`docs/wishlist-v2/api/API.md`](docs/wishlist-v2/api/API.md); the response types are shared with the frontend (`src/lib/types.ts`). Every route is in `worker/src/index.ts`. Permissions are checked in SQL (owner, or an active co-planner), and anything you may not see is a 404. Writes that must not race (one date per wishlist, one claim per idea, invites) are single conditional statements, since D1 has no interactive transactions.

**Migrations**: `worker/migrations`, applied with `wrangler d1 migrations apply` before each deploy. Add a new numbered file for any schema change; never edit one that has shipped.

**Frontend**: Vite, React 19, react-router 7 and TanStack Query; styling is design tokens plus CSS Modules, no component library. Pages use container queries (1100 px and 760 px) so dialogs and the shell share one set of breakpoints.

## What I learned

The code worked, but the product did not take off: we built before checking clearly enough what problem it solves for users. Since then I start projects by defining the use case first.

## Environment

| Where | Variable | What it is |
|---|---|---|
| `worker/wrangler.jsonc` | `PUBLIC_APP_URL` | Base for share and invite links. Falls back to the request's own origin. |
| | `MAIL_FROM` | Sender for invite and undo emails. |
| Cloudflare secret | `RESEND_API_KEY` | Optional email for invites and guests' undo links (`npx wrangler secret put RESEND_API_KEY`). Unset = no email; the app copies the links instead. |
| `worker/.dev.vars` | `AUTH_API_URL` | Local development only: confirm tokens with planary-auth over HTTPS, since there is no service binding locally. See `worker/.dev.vars.example`. |
| `.env` | `VITE_AUTH_BASE_URL` | Where sign-in lives. Defaults to `https://auth.planary.ch`; its allowed return origins must include this app. |
| | `VITE_API_BASE_URL` | Optional; defaults to the same origin. |

## Run locally

```bash
npm install && npm --prefix worker install
cp worker/.dev.vars.example worker/.dev.vars
npm --prefix worker run db:migrate:local   # creates the local D1 database
npm run api:dev                            # the Worker on :8787
npm run dev                                # frontend on :5376, proxies /api to :8787
```

Sign-in goes through auth.planary.ch, so your local origin has to be in its allowed return origins. To see the app filled in like the design, seed the demo data for your Planary user id (shown by `GET /api/me`):

```bash
npm run seed -- --user <your-user-id>            # refuses if you already have lists
npm run seed -- --user <your-user-id> --reset    # replaces your lists with the demo data
npm run seed -- --user <your-user-id> --remote   # the deployed database instead of the local one
```

## Tests

```bash
npm run test                      # frontend unit tests (vitest)
npx tsc --noEmit                  # types
npm run test:worker               # Worker types, then its tests inside the Workers runtime on a local D1
```

CI (`.github/workflows/ci.yaml`) runs all of these on every pull request, so the integration tests, including the privacy test, always run.

## Deploy

`.github/workflows/deploy.yml` runs on every push to main: it builds the app, creates the D1 database on the first run, applies migrations, then deploys the Worker with its custom domain. It needs the repository secret `CLOUDFLARE_API_TOKEN` (Workers Scripts, Workers Routes and D1 edit rights), and `CLOUDFLARE_ACCOUNT_ID` if the token sees more than one account. By hand: `npm run deploy` after `npm --prefix worker run db:migrate`.
