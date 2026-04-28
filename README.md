# Planary Wishlist

Single-repo deployment for the Planary Wishlist app.

This repo includes:

- A Vite + React frontend with the current Planary blue/violet styling
- A Go backend served through Vercel Functions in `/api`
- Postgres-backed persistence for users, wishlists, and wishlist items
- Reused React Bits-style animated text components from your other project

## Repo shape

- `src/`: React app
- `api/`: Vercel Go function entrypoints
- `internal/`: shared Go packages for auth, DB, and handlers
- `cmd/local-api/`: optional local Go server for development
- `vercel.json`: SPA + API deployment config

## Environment variables

Create a local `.env` file from `.env.example`.

Required:

- `DATABASE_URL`
- `JWT_SECRET`

Optional for local development:

- `COOKIE_SECURE=false`
- `PORT=8080`

## Local development

1. Install frontend dependencies:

```bash
npm install
```

2. Install Go dependencies:

```bash
go mod tidy
```

3. Add a local `.env`:

```env
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
JWT_SECRET=replace-with-a-long-random-secret
COOKIE_SECURE=false
PORT=8080
```

4. Start the Go API:

```bash
npm run api:dev
```

5. In a second terminal, start the frontend:

```bash
npm run dev
```

The Vite dev server proxies `/api` to `http://localhost:8080`.

## Production deployment path

### 1. Create the GitHub repo

Create a new repository named `planary-wishlist`, then push this folder:

```bash
git init
git branch -m main
git add .
git commit -m "Create Planary Wishlist app"
git remote add origin <your-github-url>
git push -u origin main
```

### 2. Create the database

Recommended: Neon Postgres.

1. Create a new Neon project
2. Copy the connection string
3. Set `DATABASE_URL` in Vercel

The Go app creates the required tables automatically on first request.

### 3. Deploy to Vercel

1. Import the `planary-wishlist` GitHub repo into Vercel
2. Keep the detected framework as Vite
3. Add environment variables:
   - `DATABASE_URL`
   - `JWT_SECRET`
4. Deploy

Because the frontend and Go API live in the same repo and same Vercel project:

- The browser calls `/api/...` on the same origin
- No separate CORS setup is needed
- Session auth works with an `HttpOnly` cookie

### 4. Test the deployment

After deployment:

1. Open `/`
2. Register a new account
3. Confirm `/api/auth/me` returns the signed-in user
4. Add an item to the wishlist
5. Refresh the page and confirm the item persists

### 5. Optional custom domain

If you want a nicer URL:

1. Add a domain in Vercel
2. Point DNS there
3. Re-test auth and wishlist creation on the custom domain

## Build checks

Verified locally:

- `npm run build`
- `go build ./...`

## Notes

- The frontend uses React Router, so `vercel.json` rewrites non-API routes to `index.html`
- The backend is designed for Vercel Functions, but the same handler package is shared with the local Go server
- Cookies are secure by default on Vercel; set `COOKIE_SECURE=false` only for local HTTP development
