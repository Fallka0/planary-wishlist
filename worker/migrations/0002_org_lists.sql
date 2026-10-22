-- Wishlists that belong to a Planary organisation (planary-org), edited by its team.
-- Who is in which organisation is copied from planary-org on sign-in (src/orgs.ts), only for
-- organisations that use Wishlist. Turning Wishlist off there hides the lists; nothing is deleted.

ALTER TABLE lists ADD COLUMN org_id TEXT;                -- NULL = a personal list
CREATE INDEX lists_org_idx ON lists (org_id, position);

CREATE TABLE orgs (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  max_lists  INTEGER,                                    -- from the plan; NULL = unlimited
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE org_members (
  org_id  TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX org_members_user_idx ON org_members (user_id);

-- When a user's organisations were last read from planary-org (epoch ms).
CREATE TABLE org_syncs (
  user_id   TEXT PRIMARY KEY,
  synced_at INTEGER NOT NULL
);
