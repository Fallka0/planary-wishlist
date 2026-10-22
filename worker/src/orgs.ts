// Organisation wishlists: lists that belong to a Planary organisation (planary-org) and that its
// whole team edits. Who is in which organisation is copied here from planary-org over the ORG
// binding, at most every SYNC_MS per person, and only for organisations that use Wishlist.
// The team counts as the list's owner everywhere, so the privacy rule holds for all of them:
// nobody in the organisation learns what's reserved.
import type { OrgRef } from '../../src/lib/types';
import { all, first, NOW } from './db';
import type { Env, User } from './env';

const SYNC_MS = 2 * 60_000;

interface OrgFromPlanary {
  id: string;
  name: string;
  services?: string[];
  wishlist?: { maxLists?: number | null };
}

async function askOrg(env: Env, userId: string): Promise<OrgFromPlanary[] | null> {
  if (!env.ORG || !env.INTERNAL_KEY) return null;
  const res = await env.ORG.fetch(
    new Request(`https://org.internal/internal/people/${encodeURIComponent(userId)}/orgs`, { headers: { 'x-internal-key': env.INTERNAL_KEY } }),
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { orgs?: OrgFromPlanary[] };
  return Array.isArray(body.orgs) ? body.orgs : null;
}

/**
 * Refreshes the user's organisations from planary-org when the copy is older than SYNC_MS. When
 * planary-org can't be reached the old copy stays, so a short outage doesn't lock a team out.
 */
export async function syncOrgs(env: Env, user: User, force = false): Promise<void> {
  if (!env.ORG || !env.INTERNAL_KEY) return;
  const now = Date.now();
  if (!force) {
    const last = await first<{ synced_at: number }>(env.DB, 'SELECT synced_at FROM org_syncs WHERE user_id = ?', user.id);
    if (last && now - last.synced_at < SYNC_MS) return;
  }
  let orgs: OrgFromPlanary[] | null;
  try {
    orgs = await askOrg(env, user.id);
  } catch (e) {
    console.log(`org sync ${user.id}: ${e}`);
    return;
  }
  if (!orgs) return;
  const db = env.DB;
  const using = orgs.filter((o) => typeof o.id === 'string' && typeof o.name === 'string' && o.services?.includes('wishlist'));
  await db.batch([
    db.prepare('DELETE FROM org_members WHERE user_id = ?').bind(user.id),
    ...using.flatMap((o) => {
      const max = o.wishlist?.maxLists;
      return [
        db
          .prepare(
            `INSERT INTO orgs (id, name, max_lists) VALUES (?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET name = excluded.name, max_lists = excluded.max_lists, updated_at = ${NOW}`,
          )
          .bind(o.id, o.name.slice(0, 80), typeof max === 'number' && max >= 0 ? Math.trunc(max) : null),
        db.prepare('INSERT INTO org_members (org_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING').bind(o.id, user.id),
      ];
    }),
    db
      .prepare('INSERT INTO org_syncs (user_id, synced_at) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET synced_at = excluded.synced_at')
      .bind(user.id, now),
  ]);
}

export interface MyOrg extends OrgRef {
  maxLists: number | null;
}

/** The organisations the user may make wishlists for. */
export async function myOrgs(db: D1Database, userId: string): Promise<MyOrg[]> {
  const rows = await all<{ id: string; name: string; max_lists: number | null }>(
    db,
    `SELECT o.id, o.name, o.max_lists FROM org_members m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = ? ORDER BY o.name, o.id`,
    userId,
  );
  return rows.map((r) => ({ id: r.id, name: r.name, maxLists: r.max_lists }));
}

export async function orgRef(db: D1Database, orgId: string | null): Promise<OrgRef | null> {
  if (!orgId) return null;
  const row = await first<{ id: string; name: string }>(db, 'SELECT id, name FROM orgs WHERE id = ?', orgId);
  return row ? { id: row.id, name: row.name } : { id: orgId, name: 'Organisation' };
}

/** True when the user is on the organisation's team (as last synced). */
export async function inOrg(db: D1Database, orgId: string, userId: string): Promise<boolean> {
  return Boolean(await first(db, 'SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ?', orgId, userId));
}

export interface OrgListTotals {
  id: number;
  title: string;
  items: number;
  /** CHF cents, items in CHF only. */
  value: number;
  shared: boolean;
  createdBy: string;
  /** Epoch ms */
  updatedAt: number;
}

/**
 * An organisation's wishlists for the portal (via planary-org). Totals per list, never a
 * reservation: the organisation owns these lists.
 */
export async function orgLists(db: D1Database, orgId: string): Promise<OrgListTotals[]> {
  const rows = await all<{ id: number; title: string; items: number; value: number; share_enabled: number; created_by: string; updated_at: string; last_item: string | null }>(
    db,
    `SELECT l.id, l.title, l.share_enabled, l.updated_at,
       COALESCE(p.display_name, '') AS created_by,
       (SELECT COUNT(*) FROM items i WHERE i.list_id = l.id) AS items,
       (SELECT COALESCE(SUM(i.price_cents), 0) FROM items i WHERE i.list_id = l.id AND i.currency = 'CHF') AS value,
       (SELECT MAX(i.updated_at) FROM items i WHERE i.list_id = l.id) AS last_item
     FROM lists l LEFT JOIN profiles p ON p.user_id = l.owner_id
     WHERE l.org_id = ? AND l.kind = 'wish'
     ORDER BY l.position, l.created_at, l.id`,
    orgId,
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    items: r.items,
    value: r.value,
    shared: Boolean(r.share_enabled),
    createdBy: r.created_by,
    updatedAt: Math.max(Date.parse(r.updated_at) || 0, Date.parse(r.last_item ?? '') || 0),
  }));
}
