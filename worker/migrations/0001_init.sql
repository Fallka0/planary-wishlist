-- Wishlist v2 on D1. The same tables as docs/wishlist-v2/DATA-MODEL.md, in SQLite:
-- user ids are planary-auth ids (TEXT), timestamps are ISO 8601 UTC strings, booleans are 0/1.

-- Display names for the people on a list. Refreshed from planary-auth on every signed-in request.
CREATE TABLE profiles (
  user_id      TEXT PRIMARY KEY,
  email        TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- A wishlist (kind 'wish', things you want) or gift ideas for one person (kind 'person').
CREATE TABLE lists (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id          TEXT NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN ('wish', 'person')),
  title             TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 60),
  person_full_name  TEXT NOT NULL DEFAULT '',            -- person lists only
  person_notes      TEXT NOT NULL DEFAULT '',            -- person lists only, one note per line
  share_enabled     INTEGER NOT NULL DEFAULT 0,          -- wishlists only
  share_token       TEXT UNIQUE,                         -- wishlists only, random, rotatable
  invite_token_hash TEXT UNIQUE,                         -- person lists only: sha256 of the reusable invite link
  position          INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (kind = 'person' OR (person_full_name = '' AND person_notes = ''))
);
CREATE INDEX lists_owner_idx ON lists (owner_id, kind, position);

-- Birthdays and holidays. A wishlist has at most one; person lists any number, each with a budget.
CREATE TABLE occasions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id      INTEGER NOT NULL REFERENCES lists (id) ON DELETE CASCADE,
  label        TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 40),
  month        INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  day          INTEGER NOT NULL CHECK (day BETWEEN 1 AND 31),
  year         INTEGER CHECK (year BETWEEN 2000 AND 2100),  -- NULL = every year
  budget_cents INTEGER CHECK (budget_cents IS NULL OR budget_cents >= 0),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX occasions_list_idx ON occasions (list_id);

-- Things on a wishlist, or ideas on a person list.
CREATE TABLE items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id     INTEGER NOT NULL REFERENCES lists (id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  url         TEXT NOT NULL DEFAULT '',
  image_url   TEXT NOT NULL DEFAULT '',
  store       TEXT NOT NULL DEFAULT '',                  -- host without www, e.g. galaxus.ch
  note        TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  currency    TEXT NOT NULL DEFAULT 'CHF' CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  priority    INTEGER NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3), -- 1 must have, 2 would love, 3 nice to have
  added_by    TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX items_list_idx ON items (list_id, position, created_at);

-- Budget ticks: an idea counts toward an occasion's budget.
CREATE TABLE item_picks (
  item_id     INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  occasion_id INTEGER NOT NULL REFERENCES occasions (id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, occasion_id)
);

-- Who's getting what. One per item.
--   wishlist:    made by visitors through the share link (an account or an email). Never shown to the owner.
--   person list: made by the owner or a co-planner, visible to all of them.
CREATE TABLE reservations (
  item_id         INTEGER PRIMARY KEY REFERENCES items (id) ON DELETE CASCADE,
  source          TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'member')),
  user_id         TEXT,
  email           TEXT,
  undo_token_hash TEXT UNIQUE,                           -- sha256 hex of the token guests get
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (user_id IS NOT NULL OR email IS NOT NULL)
);
CREATE INDEX reservations_user_idx ON reservations (user_id);

-- Co-planners of a person list: invited by email, active once they accept.
CREATE TABLE list_members (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id           INTEGER NOT NULL REFERENCES lists (id) ON DELETE CASCADE,
  email             TEXT NOT NULL,
  user_id           TEXT,
  status            TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active')),
  invite_token_hash TEXT UNIQUE,
  invited_by        TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  joined_at         TEXT,
  UNIQUE (list_id, email),
  CHECK (status = 'invited' OR user_id IS NOT NULL)
);
CREATE INDEX list_members_user_idx ON list_members (user_id);

-- "Shared with me": a signed-in user opened someone's share link.
CREATE TABLE list_followers (
  list_id    INTEGER NOT NULL REFERENCES lists (id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (list_id, user_id)
);
CREATE INDEX list_followers_user_idx ON list_followers (user_id);
