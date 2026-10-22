import type { PersonRef } from '../../src/lib/types';
import { all, first, idList } from './db';
import { forbidden, notFound } from './errors';
import { initials } from './util';

export type Kind = 'wish' | 'person';

/**
 * What the caller may do with one list: they own it, or they're an active co-planner. On an
 * organisation's wishlist the whole team is the owner (orgId is set, ownerId is who started it).
 */
export interface Access {
  listId: number;
  kind: Kind;
  ownerId: string;
  orgId: string | null;
  title: string;
  role: 'owner' | 'member';
}

export const isOwner = (a: Access) => a.role === 'owner';

/**
 * The permission filter every list query uses; the user id is bound three times. A personal list:
 * its owner and active co-planners. An organisation's list: the organisation's team only (someone
 * who left loses it, even if they started it).
 */
export const CAN_SEE_LIST = `((l.org_id IS NULL AND (l.owner_id = ? OR EXISTS (
  SELECT 1 FROM list_members m WHERE m.list_id = l.id AND m.user_id = ? AND m.status = 'active')))
  OR (l.org_id IS NOT NULL AND EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = l.org_id AND om.user_id = ?)))`;

type ListRow = { id: number; kind: Kind; owner_id: string; org_id: string | null; title: string };

const toAccess = (row: ListRow, userId: string): Access => ({
  listId: row.id,
  kind: row.kind,
  ownerId: row.owner_id,
  orgId: row.org_id,
  title: row.title,
  // Seeing an organisation's list means being on its team.
  role: row.owner_id === userId || row.org_id !== null ? 'owner' : 'member',
});

/** A list the user may see. Anything else is not_found, so it can't be probed. */
export async function listAccess(db: D1Database, listId: number, userId: string): Promise<Access> {
  const row = await first<ListRow>(db, `SELECT l.id, l.kind, l.owner_id, l.org_id, l.title FROM lists l WHERE l.id = ? AND ${CAN_SEE_LIST}`, listId, userId, userId, userId);
  if (!row) throw notFound();
  return toAccess(row, userId);
}

/** An item together with the caller's access to its list, and who added it. */
export async function itemAccess(db: D1Database, itemId: number, userId: string): Promise<{ access: Access; addedBy: string | null }> {
  const row = await first<ListRow & { added_by: string | null }>(
    db,
    `SELECT l.id, l.kind, l.owner_id, l.org_id, l.title, i.added_by FROM items i JOIN lists l ON l.id = i.list_id
     WHERE i.id = ? AND ${CAN_SEE_LIST}`,
    itemId,
    userId,
    userId,
    userId,
  );
  if (!row) throw notFound();
  return { access: toAccess(row, userId), addedBy: row.added_by };
}

/** A member's attempt at an owner-only action is a clear 403. */
export function requireOwner(a: Access, message: string) {
  if (!isOwner(a)) throw forbidden(message);
}

export function personRef(id: string, name: string, me: string): PersonRef {
  const n = name.trim() ? name : 'Someone';
  return { id, name: n, initials: initials(n), isMe: id === me };
}

/** Display names for user ids. Ids without a profile come back as "Someone". */
export async function people(db: D1Database, ids: string[], me: string): Promise<Map<string, PersonRef>> {
  const out = new Map<string, PersonRef>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return out;
  const rows = await all<{ user_id: string; display_name: string }>(
    db,
    'SELECT user_id, display_name FROM profiles WHERE user_id IN (SELECT value FROM json_each(?))',
    idList(unique),
  );
  for (const r of rows) out.set(r.user_id, personRef(r.user_id, r.display_name, me));
  for (const id of unique) if (!out.has(id)) out.set(id, personRef(id, '', me));
  return out;
}
