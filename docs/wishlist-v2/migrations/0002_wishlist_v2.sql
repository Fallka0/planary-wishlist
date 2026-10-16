-- Planary Wishlist v2: several lists per user, gift-idea lists for people,
-- occasions with budgets, co-planners, and reservations the list owner never sees.
--
-- Safe to run more than once (IF NOT EXISTS + ON CONFLICT). The legacy tables
-- (users, wishlists, wishlist_items) are left in place and only read from.
-- Owner and member ids are Supabase auth user ids (UUID), as in pkg/auth.

BEGIN;

-- One migration runner at a time (Vercel cold starts can run in parallel).
SELECT pg_advisory_xact_lock(727274);

-- Display names for "Noa Brunner's wishlist", "Lea is getting this" etc.
-- Upserted from the Supabase user on every authenticated request.
CREATE TABLE IF NOT EXISTS profiles (
  user_id      UUID PRIMARY KEY,
  email        TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A list is either a wishlist ("things I want", kind = 'wish')
-- or gift ideas for one person (kind = 'person').
CREATE TABLE IF NOT EXISTS lists (
  id                 BIGSERIAL PRIMARY KEY,
  owner_id           UUID NOT NULL,
  kind               TEXT NOT NULL CHECK (kind IN ('wish', 'person')),
  title              TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 60),
  person_full_name   TEXT NOT NULL DEFAULT '',           -- person lists only
  person_notes       TEXT NOT NULL DEFAULT '',           -- person lists only, one note per line
  share_enabled      BOOLEAN NOT NULL DEFAULT FALSE,     -- wish lists only
  share_token        TEXT UNIQUE,                        -- wish lists only, random, rotatable
  invite_token_hash  TEXT UNIQUE,                        -- person lists only: sha256 of the reusable co-planner invite link
  position           INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  legacy_wishlist_id BIGINT UNIQUE,
  CONSTRAINT person_fields_only_on_person CHECK (kind = 'person' OR (person_full_name = '' AND person_notes = '')),
  CONSTRAINT sharing_only_on_wish CHECK (kind = 'wish' OR (share_enabled = FALSE AND share_token IS NULL)),
  CONSTRAINT invites_only_on_person CHECK (kind = 'person' OR invite_token_hash IS NULL)
);
CREATE INDEX IF NOT EXISTS lists_owner_idx ON lists (owner_id, kind, position);

-- Dates. A wish list has at most one (its birthday etc., enforced in the API);
-- a person list can have several. year IS NULL means it repeats every year.
CREATE TABLE IF NOT EXISTS occasions (
  id           BIGSERIAL PRIMARY KEY,
  list_id      BIGINT NOT NULL REFERENCES lists (id) ON DELETE CASCADE,
  label        TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 40),
  month        SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  day          SMALLINT NOT NULL CHECK (day BETWEEN 1 AND 31),
  year         SMALLINT CHECK (year BETWEEN 2000 AND 2100),
  budget_cents BIGINT CHECK (budget_cents IS NULL OR budget_cents >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS occasions_list_idx ON occasions (list_id);

-- Items on a wishlist, or ideas on a person list.
CREATE TABLE IF NOT EXISTS items (
  id             BIGSERIAL PRIMARY KEY,
  list_id        BIGINT NOT NULL REFERENCES lists (id) ON DELETE CASCADE,
  name           TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  url            TEXT NOT NULL DEFAULT '',
  image_url      TEXT NOT NULL DEFAULT '',
  store          TEXT NOT NULL DEFAULT '',               -- host without www, e.g. galaxus.ch
  note           TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  price_cents    BIGINT NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  currency       TEXT NOT NULL DEFAULT 'CHF' CHECK (currency ~ '^[A-Z]{3}$'),
  priority       SMALLINT NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3), -- 1 must have, 2 would love, 3 nice to have
  added_by       UUID,
  position       INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  legacy_item_id BIGINT UNIQUE
);
CREATE INDEX IF NOT EXISTS items_list_idx ON items (list_id, position, created_at DESC);

-- Person lists: which ideas count toward which occasion's budget.
CREATE TABLE IF NOT EXISTS item_picks (
  item_id     BIGINT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  occasion_id BIGINT NOT NULL REFERENCES occasions (id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, occasion_id)
);

-- "I'll get this". One per item.
--   wish list:   made by visitors through the share link (user or email).
--                NEVER returned to the list owner by any endpoint.
--   person list: made by the owner or a co-planner (user_id), visible to all of them.
CREATE TABLE IF NOT EXISTS reservations (
  item_id         BIGINT PRIMARY KEY REFERENCES items (id) ON DELETE CASCADE,
  source          TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'member', 'legacy')),
  user_id         UUID,
  email           TEXT,
  undo_token_hash TEXT UNIQUE,                            -- sha256 hex of the token mailed to guests
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reserver_known CHECK (source = 'legacy' OR user_id IS NOT NULL OR email IS NOT NULL)
);

-- Co-planners on person lists. The owner is not a row here.
CREATE TABLE IF NOT EXISTS list_members (
  id                BIGSERIAL PRIMARY KEY,
  list_id           BIGINT NOT NULL REFERENCES lists (id) ON DELETE CASCADE,
  email             TEXT NOT NULL,
  user_id           UUID,
  status            TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active')),
  invite_token_hash TEXT UNIQUE,
  invited_by        UUID NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  joined_at         TIMESTAMPTZ,
  UNIQUE (list_id, email),
  CONSTRAINT active_has_user CHECK (status = 'invited' OR user_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS list_members_user_idx ON list_members (user_id) WHERE user_id IS NOT NULL;

-- "Shared with me": a signed-in user opened someone's share link.
CREATE TABLE IF NOT EXISTS list_followers (
  list_id    BIGINT NOT NULL REFERENCES lists (id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (list_id, user_id)
);
CREATE INDEX IF NOT EXISTS list_followers_user_idx ON list_followers (user_id);

-- ── Copy existing data (only wishlists that already belong to a Supabase user) ──
DO $$
BEGIN
  IF to_regclass('public.wishlists') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'wishlists' AND column_name = 'auth_user_id') THEN

    INSERT INTO lists (owner_id, kind, title, legacy_wishlist_id, created_at)
    SELECT w.auth_user_id, 'wish', LEFT(COALESCE(NULLIF(TRIM(w.title), ''), 'My Wishlist'), 60), w.id, w.created_at
    FROM wishlists w
    WHERE w.auth_user_id IS NOT NULL
    ON CONFLICT (legacy_wishlist_id) DO NOTHING;

    INSERT INTO items (list_id, name, url, image_url, store, note, price_cents, priority, added_by, created_at, legacy_item_id)
    SELECT l.id,
           LEFT(wi.name, 200),
           wi.url,
           wi.image_url,
           regexp_replace(regexp_replace(lower(wi.url), '^https?://(www\.)?', ''), '[/?#:].*$', ''),
           LEFT(wi.notes, 500),
           GREATEST(wi.price_cents, 0),
           LEAST(GREATEST(wi.priority, 1), 3),
           l.owner_id,
           wi.created_at,
           wi.id
    FROM wishlist_items wi
    JOIN lists l ON l.legacy_wishlist_id = wi.wishlist_id
    WHERE char_length(TRIM(wi.name)) > 0
    ON CONFLICT (legacy_item_id) DO NOTHING;

    -- Old "reserved" was a plain flag with no reserver. Keep it as taken.
    INSERT INTO reservations (item_id, source)
    SELECT i.id, 'legacy'
    FROM items i
    JOIN wishlist_items wi ON wi.id = i.legacy_item_id
    WHERE wi.reserved
    ON CONFLICT (item_id) DO NOTHING;
  END IF;
END $$;

COMMIT;
