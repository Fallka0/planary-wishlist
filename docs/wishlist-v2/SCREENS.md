# Screens · Wishlist v2

Each section names its screenshots in `screenshots/` and its static render in `prototype/static/`. The interactive source for all of them is `prototype/wishlist-app.dc.html` (one file; each screenshot is the same app started in a different state).

Copy below is final unless marked. English UI, Swiss formatting (see "Formatting rules" at the end). Sample names and products in the screenshots are demo data, not copy.

---

## 0. App shell

**Screens:** every signed-in screen. Phone menu: `WL-Phone-Menu.png`.

- **Frame:** the app sits inside a 14 px `--frame` band (8 px under 640 px viewport), same as auth.planary.ch.
- **Top bar** (64 px, bottom border `--rule`):
  - Left: Planary mark + "Planary" wordmark (Unbounded 400, 19 px) linking to planary.ch, a 1 px divider, then "Wishlist" (14 px, `--t2`).
  - Search field (max 420 px, pill, `--card`), placeholder "Search lists and ideas". Searches list titles and item names across everything the user can see; results in a popover (not designed yet: keep it simple, grouped "Lists" / "Ideas", Enter opens the first).
  - Right: theme toggle (moon in light, sun in dark; `aria-label` "Switch to dark mode" / "Switch to light mode"), then the avatar (initials, links to auth.planary.ch, `aria-label` "Your Planary account, <name>").
  - Signed out (public page): no search, no avatar; a "Sign in" outline button instead.
- **Sidebar** (264 px; 232 px when the content container is under 1100 px; hidden under 760 px):
  - "New list" primary button (full width)
  - "Overview" nav item
  - Group "My wishlists": gift icon, title, item count
  - Group "Gift ideas": initials avatar, name, days to next occasion as "17 d"
  - Group "Shared with me": owner initials, list title
  - Empty group texts: "No wishlists yet" · "Nobody yet" · "Lists friends share with you show up here."
  - Footer: "Planary account" link + "Signed in as <name>"
  - Active item: `--card` background, weight 700, `aria-current="page"`.
- **Phone (<760 px):** menu button (left of the logo, `aria-label` "Open your lists") opens the sidebar as a full-screen sheet with title "Lists" and a close button. The wordmark text hides; the "Wishlist" label stays. Search becomes an icon button.
- **Toast:** bottom-center pill, `--btn` background, check icon, 2.8 s, `role="status"`.

## 1. Overview · `/app`

**Screens:** `WL-Home`, `WL-Dark-Home`, `WL-Phone-Home`

- Header: H1 "Overview" + "New list" primary button.
- **Coming up** (caption right: "Next 10 weeks"): cards for every occasion in the next 70 days, sorted by date, max 3 on desktop (horizontal grid, `minmax(280px, 1fr)`). Hide the section when nothing is coming up. Card content:
  - title + weekday date ("Mon, 2 Nov"), countdown number (Unbounded 300, 40 px) + "days" (shows "today" / "tomorrow" for 0 / 1)
  - progress bar + two captions, depending on the source:
    - Person-list occasion: bar = picked / budget. Left "CHF 96.– of CHF 150.–", right "2 ideas picked". No budget: no bar, left "3 ideas".
    - Same occasion on several person lists on the same date (Christmas): one merged card. Left = names joined with ", ", right "CHF 29.90 of CHF 240.–".
    - Shared-with-me list with a date: bar = taken / items. Left "You're getting 1 item" or "Nothing reserved by you", right "3 of 6 taken".
    - Your own wishlist's date: no bar, left "9 items", right "Shared" or "Only you".
  - Click opens the list (merged card opens the first person in it).
- **My wishlists** (caption "Things you'd like yourself"): cards in `minmax(220px, 1fr)` (2 columns on phone). Each card: 2×2 mosaic of the first 4 item images on tiles (empty tiles when fewer), title, tag "Shared" (globe) or "Private" (lock), "9 items · 24 May".
- **Gift ideas** (caption "Only you and your co-planners see these"): cards `minmax(240px, 1fr)`: initials avatar (44 px), name, "Birthday · Mon, 2 Nov" (or "No date yet"), "6 ideas", co-planner avatar stack.
- **Shared with me**: rows with owner avatar, title, "<owner> · 6 items", date right, chevron.
- Sections with no content hide. If *everything* is empty → the first-run screen (§9).

## 2. Wishlist · `/app/lists/:id`

**Screens:** `WL-List`, `WL-Dark-List`, `WL-Phone-List`

- Crumb "My wishlists", H1 = title, meta row: "9 items", "CHF 1’146.65 in total" (hidden when 0), share state with icon ("Shared by link" globe / "Only you" lock).
- Actions: "Share" outline button (opens §5), more-menu (rename, set date, delete list; delete asks to confirm: "Delete <title>? This removes its 9 items and turns off its link.").
- **Quick add bar:** link icon, input "Paste a link or type a name", "Add" button.
  - Looks like a URL → opens Add (§3) straight into *reading*.
  - Plain text → opens Add in *manual* with the name prefilled.
  - Empty → opens Add at *paste*.
- **Toolbar:** filter chips "All · Must have · Would love · Nice to have" (single-select, `aria-pressed`; horizontally scrollable on phone), sort select "Priority / Newest / Price", layout toggle rows/grid (remember per user in localStorage).
- **Rows** (default): 64 px tile (56 on phone) · name (700) + store link + note · priority (three dots, filled = importance, + label) · price (right, tabular) · edit button. Phone: price top-right, priority + edit on the second line.
- **Grid:** square tile, name, "store · priority", price, "Edit" button.
- Footer note (eye-off icon): "You won't see what friends reserve, so your gifts stay a surprise."
- A newly added item flashes violet at 18% and fades over 1.8 s.

## 3. Add by link (dialog)

**Screens:** `WL-Add-Paste`, `WL-Add-Loading`, `WL-Add-Filled`, `WL-Add-Failed`, `WL-Dark-Add`, `WL-Phone-Add` (bottom sheet)

Title "Add to <list>" (person list: "Add an idea for <name>"). Close button top right; Esc closes.

| State | Subtitle | Body | Footer |
|---|---|---|---|
| paste | "Paste a link from any online shop." | Field "Product link" (`type=url`), help "Works with most shops, like Galaxus, Digitec, Zalando, Manor and IKEA. We read the name, picture and price for you." | ghost "Add without a link" · primary "Get details" |
| reading | "Getting the details. This takes a second." | URL pill, skeleton preview (tile + 4 bars, shimmer), status line with spinner "Reading galaxus.ch…" (`role=status`) | "Cancel" · disabled "Add item" |
| filled | "Check the details, then add it." | Preview card (image, globe + store, name, price) + form | "Cancel" · "Add to <list>" |
| failed | "The link is saved, the rest is up to you." | Error note "We couldn't read details from <store>. Fill them in yourself, the link is saved with the item." + empty form | same as filled |
| manual | "No link needed. Just say what it is." | form only | same as filled |

Form: "Name" (required; error "Give it a name so you recognise it later."), "Price" with "CHF" prefix (decimal keyboard, accepts "179", "179.00", "179,90"), "Priority" segmented control (Must have / Would love / Nice to have, default Would love), "Note *for whoever buys it*" textarea, placeholder "Colour, size, or which version". Person lists: no priority and no note; show a read-only "Shop" field instead.

Reading calls `POST /api/link-preview`; cancel aborts the request. On success toast "Added to <list>".

## 4. Edit item (drawer)

**Screen:** `WL-Edit`

Right drawer 460 px (bottom sheet on phone) over a light scrim. Title "Edit item", subtitle "On <list>". Preview card with store and "Open in shop" link. Fields as in §3. Footer: danger "Remove" (left, trash icon, no confirm, toast "Removed from <list>" with **Undo** for 5 s), "Cancel", "Save" (toast "Saved").

## 5. Share (dialog, wishlists only)

**Screens:** `WL-Share`, `WL-Dark-Share`

- Title "Share <list>", subtitle "Send the link to whoever asks what you'd like."
- Switch row "Share by link": on "On. Anyone with the link can open it." / off "Off. Only you can see this list."
- When on: read-only link field + "Copy" primary button (turns to check + "Copied").
- Facts: globe "Anyone with the link can see the list and reserve items. They don't need an account." · eye-off "You never see what's reserved, or by whom. Friends see it, so nobody buys the same thing twice."
- Footer: ghost "Make a new link" (toast "New link made. The old one no longer works.") · "Done".

## 6. Person list · `/app/people/:id`

**Screens:** `WL-Person`, `WL-Dark-Person`, `WL-Phone-Person`

- Crumb "Gift ideas"; 64 px initials avatar; H1 = name; meta: full name, lock "Mom can't see this list".
- Right: co-planner avatar stack + "Plan together" outline button (opens §7).
- Main column: quick add bar (placeholder "Paste a link or note an idea"), filter chips "All · Nobody's on it · Someone's getting it", idea rows:
  - tile · name + "store · Added by Lea" (or "Added by you")
  - **pick pill** for the next occasion, label = occasion name ("Birthday"). Off: dashed outline, `--t2`. On: ink fill + check. `aria-pressed`, `aria-label` "Count toward birthday budget: <idea>". Hidden when the list has no occasions.
  - **claim:** "I'll get this" outline button → becomes green tag "You're getting this" + ghost "Undo". Someone else: grey tag "Lea is getting this". Toast on claim: "Marked as yours. Co-planners see it, Mom doesn't."
  - price
- Side column (300 px, stacks under the list on narrow screens):
  - **Occasions** box: "Add" ghost button; rows: calendar icon, label, date, "in 17 days" (right). Empty: "No dates yet. Add a birthday or holiday to see it on your overview."
  - **Budget · <next occasion>**: big amount (Unbounded 300, 34 px) "96.–", "of CHF 150.–", bar, "2 ideas picked" · "CHF 54.– left" (or "CHF 12.– over"). "Change" ghost button edits the budget. Hidden without occasions.
  - **Notes**: bullet lines; "Edit" turns them into a textarea (one note per line). Empty: "Sizes, favourite colours, things they already own."
- Empty list: dashed box "No ideas for <name> yet" / "Paste a link above or just type an idea. Add a date on the right to get a countdown and a budget."

## 7. Plan together (dialog)

**Screen:** `WL-Invite`

- Title "Plan Mom's gifts together", subtitle "Co-planners can add ideas and see who's getting what. Mom never sees this list."
- "Invite by email" field + "Invite" button; help "They sign in with their Planary account, or create one."
- People list: you ("Noa Brunner (you)", "Started this list", filled avatar), members ("Can add ideas"), pending ("Invite sent, not joined yet"), each with a remove ×.
- Footer: ghost "Copy invite link" (link icon) · "Done".
- Toast: "Invite sent to <email>", or "Invite link copied. Send it to <email>." when email delivery is off.

## 8. Shared list views

### 8a. Signed in, from "Shared with me" · `/app/shared/:token`
**Screen:** `WL-Visit`

Inside the app shell. Owner line ("Matteo Keller shared this with you", avatar), large title, meta (date, "6 ideas · 2 still free"), info note (gift icon): "Pick something and tap “I'll get this”. Matteo won't see what's reserved or by whom, so it stays a surprise." Card grid (`minmax(220px, 1fr)`, 2 columns on phone):
- free: primary "I'll get this" (reserves immediately, toast "Reserved. Others now see it as taken.") + external-link icon button "Open <item> on <store>"
- mine: green tag "You're getting this" + "Undo"
- taken: tile at 45% opacity, muted text, grey tag "Someone's getting this"
- note shown in quotes under the name

### 8b. Public link, no account · `/w/:token`
**Screens:** `WL-Public`, `WL-Dark-Public`, `WL-Phone-Public`

Same content without sidebar or search; top bar has theme toggle + "Sign in". Owner line "Noa Brunner's wishlist". Footer: "Shared with Planary Wishlist" · "Make your own list on planary.ch/wishlist".
- Signed out, "I'll get this" opens the reserve dialog (8c). Signed in, it reserves directly as in 8a.
- Owner opening their own link: replace the info note with "This is what friends see. Reservations are hidden from you." and show no buttons. (Not drawn.)
- Link off / unknown: centred message "This link doesn't work anymore" / "Ask <owner> for a new one." (not drawn; reuse the auth Message screen layout).

### 8c. Reserve without account (dialog)
**Screens:** `WL-Public-Reserve`, `WL-Phone-Reserve`

Title "You'll get this?", subtitle "It shows as taken for everyone else. Noa won't see that it's reserved, or by whom." Item card (tile, name, store, price). Field "Your email", help "We send you a link to undo this if plans change. Noa never sees it." Footer: "Have a Planary account? Sign in" (left) · "Cancel" · "Reserve". Toast: "Reserved. Everyone else now sees it as taken."

## 9. First run and empty states

**Screens:** `WL-Empty`, `WL-Empty-List`

- First run (no lists of any kind, nothing shared): H1 "What's your first list?", lead "Start with things you'd like yourself, or with ideas for someone you buy for. You can have as many of both as you want." Two large choice cards: "Things I want" ("A wishlist you can share when someone asks what you'd like.") and "Gift ideas for someone" ("Collect ideas for one person, with dates, a budget and notes. Plan alone or together."). Both open §10 with the type preselected.
- Empty wishlist: dashed box with link tile, "Nothing on <list> yet", "Copy a product link from any shop and paste it above. We fill in the name, picture and price for you."

## 10. New list (dialog)

**Screen:** `WL-New`

Title "New list". Two choice cards (`aria-pressed`): "Things I want / A wishlist to share." and "Gift ideas for someone / Private, or planned together." Field label depends on the choice: "List name" (placeholder "e.g. Ski season") or "Who is it for?" ("e.g. Dad, or Sara from work"). Footer "Cancel" · "Create list". Creates the list, navigates to it, toast "List created".

---

## Formatting rules

- **Money:** `CHF 349.–` for whole francs, `CHF 59.90` otherwise, thousands with `’` (`CHF 1’146.65`). Other currencies show their code (`EUR 49.90`). `0` = "No price". One shared `formatMoney(cents, currency)` with unit tests.
- **Dates:** "Mon, 2 Nov" (weekday, day, short month), year only when not the current or next year. Countdown is calendar days in `Europe/Zurich` (or the browser zone): "today", "tomorrow", "in 17 days" (side box) / "17" + "days" (cards) / "17 d" (sidebar).
- **Counts:** "1 item / 9 items", "1 idea / 6 ideas".
- **Apostrophes:** typographic (’) in UI copy.
- No em dashes in UI copy.
