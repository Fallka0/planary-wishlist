# Planary Wishlist

A full-stack wishlist app: create an account, build wishlists and add items by pasting a product link. The Go backend fetches the page and fills in title, image and price automatically.

Team project under the Planary brand, where I was the lead developer.

**Live:** [planary-wishlist.vercel.app](https://planary-wishlist.vercel.app)

![Go](https://img.shields.io/badge/Go-00ADD8?logo=go&logoColor=white) ![React](https://img.shields.io/badge/React-20232A?logo=react) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)

## Features

- Registration and login with session cookies (HttpOnly, JWT)
- Wishlists and items stored in Postgres
- **Link preview:** paste a URL and the backend reads Open Graph tags, JSON-LD and price hints from the page
- Frontend and Go API deployed together as one Vercel project, so no CORS setup is needed

## Architecture

```
src/            React + Vite frontend
api/            Vercel Go function entrypoints
internal/
  auth/         sessions and JWT
  db/           connection and schema
  httpapi/      HTTP handlers (auth, wishlist)
  app/          business logic, link preview
cmd/local-api/  local Go server for development
```

## What I learned

The code worked, but the product did not take off: we built before checking clearly enough what problem it solves for users. Since then I start projects by defining the use case first.

## Run locally

```bash
npm install && go mod tidy
cp .env.example .env    # set DATABASE_URL and JWT_SECRET
npm run api:dev         # Go API on :8080
npm run dev             # frontend, proxies /api to :8080
```

Tables are created automatically on the first request.
