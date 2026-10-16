# Prototype

`wishlist-app.dc.html` is the complete interactive prototype from the Planary design canvas, in one file. It's a *Design Component*: plain HTML/CSS plus a small template syntax, run by the canvas editor. It does **not** run in a normal browser by itself (it needs the canvas runtime), so use `static/` to look at pages and this file to read the details.

## How to read it

| Part | What it is | Use it for |
|---|---|---|
| `<helmet><style>` | All CSS, with tokens on `.pl` and `.pl.dark`, layout, components, container queries (`@container site (...)`) | Exact values: sizes, radii, spacing, states, breakpoints. Port to CSS Modules. |
| Markup inside `<x-dc>` | The DOM structure of every screen and dialog | Element choice, aria attributes, order, classes |
| `<sc-if value="{{ x }}">` | Render children when `x` is truthy | Which state shows what |
| `<sc-for list="{{ xs }}" as="x">` | Repeat children for each item | Lists |
| `{{ a.b }}` | Value from `renderVals()` | Where data goes |
| `<script type="text/x-dc">` | `class Component extends DCLogic` with demo data (`LISTS`, `PEOPLE`, `SHARED`), formatting (`chf`, `host`) and every interaction | Behaviour: what each button does, the order of states in the Add dialog, toast texts. Demo data for the seed command. |
| `var INIT = …` | Start state | Which screen, overlay and step to show (see below) |

### Start states used for the screenshots

| Screenshot | INIT |
|---|---|
| WL-Home | `{"screen":"home"}` |
| WL-List | `{"screen":"list","list":"bday"}` |
| WL-Person | `{"screen":"person","person":"mom"}` |
| WL-Add-Paste / -Loading / -Filled / -Failed | `{"screen":"list","list":"bday","overlay":"add","step":"paste" \| "loading" \| "filled" \| "failed","url":"…"}` |
| WL-Edit | `{"screen":"list","list":"bday","overlay":"edit","editId":"b4"}` |
| WL-Share | `{"screen":"list","list":"bday","overlay":"share"}` |
| WL-Invite | `{"screen":"person","person":"mom","overlay":"invite"}` |
| WL-New | `{"screen":"home","overlay":"new"}` |
| WL-Visit | `{"screen":"visit","shared":"matteo"}` |
| WL-Public | `{"screen":"public"}` |
| WL-Public-Reserve | `{"screen":"public","overlay":"reserve","resId":"b1"}` |
| WL-Empty | `{"screen":"empty"}` |
| WL-Empty-List | `{"screen":"list","list":"xmas"}` |
| WL-Dark-* | same as above with `"theme":"dark"` |
| WL-Phone-* | same states at 375 px wide; WL-Phone-Menu adds `"menu":true` |

## What's prototype-only

- Item tiles show category glyphs because there are no product photos. Production shows `imageUrl`, with a single fallback glyph (`design/icons.ts` → `TILE_FALLBACK`).
- Dates, countdowns and budgets are hard-coded relative to 16 Oct 2026.
- "Add" on the occasions box, "Change" on the budget, "Edit" on notes, the list more-menu and search have no behaviour in the prototype. SCREENS.md says what they do.
- The fake "Reading…" step waits 1.6 s; a URL containing `boutique` or `fail` simulates the failed state.

## Static renders

`static/WL-*.html` are the prototype states rendered once into plain HTML (same CSS, Google Fonts link, no script). Open them in a browser or with Playwright at 1440×900 / 375×812 to compare with your build.
