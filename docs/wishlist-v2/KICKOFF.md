# Kickoff prompt

Paste this into Claude Code from the repo root, after copying this folder to `docs/wishlist-v2/`.

---

We're rebuilding Planary Wishlist to a finished design. The full handoff is in `docs/wishlist-v2/`.

1. Read `docs/wishlist-v2/BRIEF.md` completely, then `SCREENS.md`, `design/DESIGN.md`, `api/API.md` and `DATA-MODEL.md`. Look at the images in `screenshots/` (start with WL-Home, WL-List, WL-Person, WL-Add-Filled, WL-Public, WL-Phone-List).
2. Before you change anything, check the repo against section 2 of the brief ("What exists today"). Tell me if something doesn't match.
3. Then give me a short plan for Phase 0 and start it on a new branch `wishlist-v2`.

Rules:
- Work phase by phase as in the brief. After each phase, stop and tell me what changed, how I can test it, and any decision you made yourself. Wait for my go.
- The decisions in section 4 are final. For the open questions in section 5, build the default.
- The design is the reference. Match the screenshots and the copy in SCREENS.md. If something isn't designed, build it in the same style and tell me.
- Wishlist owners must never see reservations, not even indirectly. Treat that as a security requirement.
- Don't add features that aren't in the brief. Collect ideas in a "Later" list instead.
