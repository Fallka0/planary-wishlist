# Planary Wishlist v2 · handoff

Design handoff for rebuilding `Fallka0/planary-wishlist`. Put this folder in the repo at `docs/wishlist-v2/`, then start Claude Code with the prompt in `KICKOFF.md`.

Design source: the "Planary homepage" canvas, rows "Planary Wishlist · app", "Wishlist · dark mode" and "Wishlist · phone" (29 interactive screens, 16 Oct 2026).

## Contents

| File | For |
|---|---|
| `KICKOFF.md` | The prompt to paste into Claude Code |
| `BRIEF.md` | **Start here.** Product, current repo state, decisions, open questions with defaults, phased plan with done-criteria, rules, out of scope |
| `SCREENS.md` | Every screen and dialog: layout, states, behaviour, exact copy, formatting rules |
| `design/DESIGN.md` | Type, layout, components, motion, dark mode, accessibility |
| `design/tokens.css` | CSS variables, light + dark, ready to import |
| `design/icons.ts` | All icon paths + the Planary mark |
| `DATA-MODEL.md` | Tables, relations, derived values, tokens |
| `migrations/0002_wishlist_v2.sql` | The migration (tested on Postgres 16, legacy data, re-runnable) |
| `api/API.md` | Endpoints, permissions, privacy rule, error codes |
| `api/api-types.ts` | Response types for the frontend |
| `screenshots/` | 29 PNGs: `WL-*` desktop light, `WL-Dark-*`, `WL-Phone-*` |
| `prototype/wishlist-app.dc.html` | Interactive prototype source (CSS, markup, behaviour, demo data) |
| `prototype/static/` | Each screen as static HTML for side-by-side checks |
| `prototype/README.md` | How to read the prototype file |

## The three rules that matter most

1. Wishlist owners never see what's reserved.
2. Match the screenshots and the copy.
3. One phase at a time, stop and report after each.
