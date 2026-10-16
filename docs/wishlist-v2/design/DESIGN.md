# Design system · Wishlist v2

Values come from `tokens.css`. When in doubt, the CSS in `prototype/wishlist-app.dc.html` (inside `<helmet><style>`) is the reference. Copy numbers from it exactly; don't round to a 4/8 grid or swap in framework defaults.

## Principles

1. **Same family as auth.planary.ch and planary.ch.** Paper and ink, indigo primary button, Unbounded light display type, Manrope UI type, monochrome studio tiles. No other accent colours. Violet is used only for focus rings and the "just added" flash.
2. **Denser than the marketing site.** It's a tool: 14 px body, 40 px nav rows, 36 px small controls on desktop. Touch targets stay 44 px on phone.
3. **Surprise is a feature.** Anything about reservations is either clearly visible (visitors, co-planners) or absent (owner). Never half-hidden.

## Type

| Use | Font | Size / line-height | Weight | Tracking |
|---|---|---|---|---|
| Page title (H1) | Unbounded | clamp(30px, 3cqw, 42px) / 1.05 | 300 | -0.045em |
| Public list title | Unbounded | clamp(40px, 5cqw, 72px) / .98 (40px phone) | 300 | -0.045em |
| Dialog title | Unbounded | 26px / 1.1 (22px phone) | 300 | -0.045em |
| Countdown, budget number | Unbounded | 40px / 34px | 300 | -0.05 to -0.06em |
| Wordmark | Unbounded | 19px | 400 | -0.05em |
| Section heading (H2) | Manrope | 15px / 1.3 | 700 | 0 |
| Item name | Manrope | 15px / 1.35 | 700 | 0 |
| Body, inputs | Manrope | 14px / 1.5 (inputs 15px) | 500 | 0 |
| Meta, captions, help | Manrope | 13px | 500 | 0, colour `--t2` |
| Nav group label, tags | Manrope | 12px | 600 | .01em |

Prices: `font-variant-numeric: tabular-nums`, weight 700, right-aligned.

## Layout

- Shell: top bar 64 px; then a wrapping flex row with the sidebar (`flex: 0 0 264px`) and main (`flex: 999 1 560px; min-width: 0`), main padding `32px 40px 72px` (28px under 1100 px, `24px 16px 56px` on phone).
- Use **container queries** on the app root (`container: site / inline-size`): breakpoints at 1100 px (narrower sidebar, idea rows wrap to two lines) and 760 px (phone: no sidebar, bottom sheets, 2-column card grids).
- Card grids use `repeat(auto-fill, minmax(min(<min>px, 100%), 1fr))`: occasions 280, wishlists 220, people 240, item cards 220.
- Person page: main `flex: 999 1 480px`, side `flex: 1 1 300px`, gap 32.

## Components

**Button**: pill, 44 px (small 36 px, padding 0 14px, 13px text), weight 600, icon gap 8. Press scales to .98.
- primary `--btn` / `--btn-fg`, hover `--btn-h`
- outline: transparent + inset 1px `--rule`; hover inset `--rule-s` and `--raise` fill
- ghost: no fill; hover `--card`
- danger: `--err` text; hover `--err-bg`
- disabled: 45% opacity, no press

**IconButton**: 40 px circle, hover `--card`, always has an `aria-label`.

**Chip** (filters): 36 px pill, 1px `--rule` border, 13px/600; on = ink fill, paper text. `aria-pressed`.

**Segmented** (rows/grid, priority): `--card` track with 3px padding; on segment `--paper` (or `--raise` in forms) plus a hairline shadow.

**Switch**: 52×32, off `--rule-s`, on `--ink`, 26 px knob slides 20 px. `role="switch"`, `aria-checked`.

**Field**: label 13px/700 above; input 46 px, radius 12, `--card` fill, border `--fb`; hover border `--rule`; focus `--raise` fill + ink border + `--focus-ring`. Help text 13px `--t2`; error 13px/600 `--err`, plus a red border and `aria-invalid`. Price field has a "CHF" prefix inside (left padding 52).

**Quick add bar**: pill on `--card`, link icon, borderless input, small primary "Add" at the right; `:focus-within` → `--raise` + ink ring + focus ring.

**Tile** (item image): `--tile-bg` radial. With an image: `object-fit: contain` and ~10% padding, so product cut-outs sit like on a studio sweep. Without: `TILE_FALLBACK` icon at 42% in `--tile-i`, stroke 1.15. Radius 12 (rows), 16 (cards, mosaic).

**Avatar**: initials in Unbounded 400, filled (`--btn`) for you, outlined (`--paper` + inset `--rule-s`) for others. Sizes 26 (nav, stacks), 32 (top bar), 44 (cards), 64 (person header). Stacks overlap by 6px with a 2px ring in the surface colour.

**Tag**: 24 px pill, `--card`, 12px/600 `--t2`; success variant `--ok-bg` / `--ok` with a check.

**Pick pill**: 32 px, dashed `--rule-s` border, check icon hidden; on: solid ink fill, paper text, check visible.

**Progress bar**: 6 px, `--rule` track, ink fill, 400 ms width transition.

**Dialog**: max 560 px (New list 640), radius 24, padding 28, `--raise`, `--shadow`, scrim `--scrim`; pops in from 14 px lower at .98 scale (260 ms). Under 760 px: bottom sheet, full width, top radius 24, max height 92vh, slides up. Focus trap, Esc closes, focus returns to the trigger.

**Drawer** (edit): right side, 14 px inset, max 460 px, slides from 40 px right (320 ms), light scrim. Bottom sheet on phone.

**Toast**: bottom-centre pill, `--btn` fill, 14px/600, check icon, slides up 12 px, 2.8 s (5 s when it has an Undo).

**Skeleton**: `--card-h` → `--rule` → `--card-h` shimmer, 1.1 s linear.

## Motion

Only these: hover/press 120 ms, dialog pop 260 ms, drawer 320 ms, toast 320 ms, the new-item violet flash 1.8 s, mosaic lift −3 px on hover, budget/progress bars 400 ms. Everything off under `prefers-reduced-motion`.

## Dark mode

All colours flip through the tokens; nothing is hard-coded. The primary button inverts (near-white with ink text). Tiles go dark graphite with light icons. Taken cards drop to 45% tile opacity in both themes. The toggle writes `data-theme` on `<html>` and `localStorage["planary-theme"]`; with nothing stored, follow the system.

## Accessibility checklist

- Real `<button>`, `<a href>`, `<input>` with `<label>`. No clickable divs.
- Every icon-only button has an `aria-label` naming the item ("Edit Trail running shoes").
- Chips, segmented controls, pick pills and choice cards use `aria-pressed`; nav uses `aria-current="page"`.
- Dialogs: `role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap, Esc, focus return.
- Status messages (reading…, toasts) use `role="status"`; form errors `role="alert"` or `aria-describedby`.
- Contrast: `--t2` on `--paper` and `--card` passes 4.5:1 in both themes. Don't put `--t2` text on `--rule` fills.
- Skip link "Skip to content" as on auth.planary.ch.
