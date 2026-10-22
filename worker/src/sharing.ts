import type { PublicItem, PublicListResponse, ReserveResponse, ShareState } from '../../src/lib/types';
import { isOwner, listAccess, people, personRef } from './access';
import { all, first, NOW, run } from './db';
import type { Env } from './env';
import { forbidden, invalid, linkOff, notFound, rateLimited, taken } from './errors';
import { type Body, int, str } from './input';
import { ITEM_ORDER, wishItems } from './items';
import { shareState } from './lists';
import { sendMail } from './mail';
import { firstOccasion, loadOccasions } from './occasions';
import { inOrg, orgRef } from './orgs';
import { cleanEmail, hashToken, newSecretToken, newShareToken } from './util';

// ── Sharing (wishlist owners) ──

async function wishOwnerAccess(db: D1Database, listId: number, userId: string) {
  const a = await listAccess(db, listId, userId);
  if (a.kind !== 'wish' || !isOwner(a)) throw notFound();
  return a;
}

/**
 * Turns a wishlist's link on or off. The first time creates the token; turning it off keeps the
 * token, so turning it back on brings the same link back.
 */
export async function setSharing(db: D1Database, userId: string, listId: number, enabled: boolean, baseURL: string): Promise<ShareState> {
  await wishOwnerAccess(db, listId, userId);
  const row = await first<{ share_token: string | null }>(
    db,
    `UPDATE lists SET share_enabled = ?, share_token = COALESCE(share_token, ?), updated_at = ${NOW} WHERE id = ? RETURNING share_token`,
    enabled ? 1 : 0, newShareToken(), listId,
  );
  return shareState(enabled, row?.share_token ?? null, baseURL);
}

/** Replaces the token. Old links stop working (link_off). */
export async function rotateShareLink(db: D1Database, userId: string, listId: number, baseURL: string): Promise<ShareState> {
  await wishOwnerAccess(db, listId, userId);
  const row = await first<{ share_enabled: number; share_token: string }>(
    db,
    `UPDATE lists SET share_token = ?, updated_at = ${NOW} WHERE id = ? RETURNING share_enabled, share_token`,
    newShareToken(), listId,
  );
  return shareState(Boolean(row?.share_enabled), row?.share_token ?? null, baseURL);
}

// ── Public page (/w/:token) ──

interface SharedList {
  id: number;
  title: string;
  ownerId: string;
  orgId: string | null;
}

/** Resolves a share token. Unknown tokens and lists with sharing off are link_off. */
async function openSharedList(db: D1Database, token: string): Promise<SharedList> {
  token = token.trim();
  if (!token) throw linkOff();
  const row = await first<{ id: number; title: string; owner_id: string; org_id: string | null }>(
    db,
    `SELECT id, title, owner_id, org_id FROM lists WHERE share_token = ? AND share_enabled = 1 AND kind = 'wish'`,
    token,
  );
  if (!row) throw linkOff();
  return { id: row.id, title: row.title, ownerId: row.owner_id, orgId: row.org_id };
}

/**
 * True for whoever owns the list: its owner, and on an organisation's list everyone on the team
 * (and who started it). They get the owner's view, never reservations, and can't reserve.
 */
async function ownsShared(db: D1Database, l: SharedList, viewerId: string): Promise<boolean> {
  if (!viewerId) return false;
  if (viewerId === l.ownerId) return true;
  return l.orgId !== null && (await inOrg(db, l.orgId, viewerId));
}

type PublicRow = {
  id: number; name: string; url: string; image_url: string; store: string; note: string;
  price_cents: number; currency: string; priority: number; status: PublicItem['status'];
};

/**
 * A shared list's items as a visitor sees them. viewerId is "" for guests. The owner never gets
 * here: publicList answers them with ownerItems.
 */
async function publicItems(db: D1Database, listId: number, itemId: number, viewerId: string): Promise<PublicItem[]> {
  const rows = await all<PublicRow>(
    db,
    `SELECT i.id, i.name, i.url, i.image_url, i.store, i.note, i.price_cents, i.currency, i.priority,
       CASE WHEN r.item_id IS NULL THEN 'free'
            WHEN ? <> '' AND r.user_id = ? THEN 'mine'
            ELSE 'taken' END AS status
     FROM items i LEFT JOIN reservations r ON r.item_id = i.id
     WHERE i.list_id = ? AND (? = 0 OR i.id = ?)` + ITEM_ORDER,
    viewerId, viewerId, listId, itemId, itemId,
  );
  return rows.map((r) => ({
    id: r.id, name: r.name, url: r.url, imageUrl: r.image_url, store: r.store, note: r.note,
    priceCents: r.price_cents, currency: r.currency, priority: r.priority as PublicItem['priority'], status: r.status,
  }));
}

/** The owner's preview of their own link: the same items, every status "hidden", from the items table only. */
async function ownerItems(db: D1Database, listId: number): Promise<PublicItem[]> {
  return (await wishItems(db, listId)).map((w) => ({
    id: w.id, name: w.name, url: w.url, imageUrl: w.imageUrl, store: w.store, note: w.note,
    priceCents: w.priceCents, currency: w.currency, priority: w.priority, status: 'hidden' as const,
  }));
}

/**
 * The shared page. viewerId is "" for guests. A signed-in visitor who isn't the owner is remembered
 * as a follower, which puts the list under "Shared with me".
 */
export async function publicList(db: D1Database, viewerId: string, token: string): Promise<PublicListResponse> {
  const l = await openSharedList(db, token);
  const owner = await ownsShared(db, l, viewerId);
  let items: PublicItem[];
  if (owner) {
    items = await ownerItems(db, l.id);
  } else {
    if (viewerId) await run(db, 'INSERT INTO list_followers (list_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING', l.id, viewerId);
    items = await publicItems(db, l.id, 0, viewerId);
  }
  const occasions = await loadOccasions(db, [l.id]);
  const refs = await people(db, [l.ownerId], viewerId);
  const org = await orgRef(db, l.orgId);
  return {
    // An organisation's list is shown as the organisation's.
    list: { title: l.title, owner: org ? personRef(`org-${l.id}`, org.name, viewerId) : refs.get(l.ownerId)!, occasion: firstOccasion(occasions.get(l.id)), items },
    viewer: { signedIn: viewerId !== '', isOwner: owner },
  };
}

// ── Abuse guard: at most 20 reservations per IP per hour. Per isolate, best effort. ──

const LIMIT = 20;
const WINDOW_MS = 60 * 60_000;
const hits = new Map<string, number[]>();

export function allowReservation(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => t > now - WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (!v.length || v[v.length - 1] <= now - WINDOW_MS) hits.delete(k);
  }
  return true;
}

export const resetReservationLimit = () => hits.clear();

/**
 * Marks an item as taken for a visitor: with their account when signed in, else with an email and
 * an undo token. The owner can never reserve on their own list.
 */
export async function reserve(env: Env, viewerId: string, b: Body, ip: string, baseURL: string): Promise<ReserveResponse> {
  const db = env.DB;
  const token = str(b, 'token') ?? '';
  const itemId = int(b, 'itemId') ?? 0;
  const l = await openSharedList(db, token);
  // Checked before anything else, so the owner's request can't tell whether the item is taken.
  if (await ownsShared(db, l, viewerId)) throw forbidden('This is your own list. Friends reserve here, you don’t.');
  let email = '';
  let undo = '';
  if (!viewerId) {
    email = cleanEmail(str(b, 'email') ?? '');
    undo = newSecretToken();
  }
  if (!(await first(db, 'SELECT 1 FROM items WHERE id = ? AND list_id = ?', itemId, l.id))) throw notFound();
  if (!allowReservation(ip)) throw rateLimited();

  const changed = await run(
    db,
    `INSERT INTO reservations (item_id, source, user_id, email, undo_token_hash) VALUES (?, 'web', ?, ?, ?) ON CONFLICT (item_id) DO NOTHING`,
    itemId, viewerId || null, viewerId ? null : email, viewerId ? null : await hashToken(undo),
  );
  if (changed === 0) {
    // Already reserved. A signed-in visitor reserving again just gets their own reservation back.
    const [item] = await publicItems(db, l.id, itemId, viewerId);
    if (viewerId && item?.status === 'mine') return { item, undoToken: null };
    throw taken();
  }
  if (viewerId) await run(db, 'INSERT INTO list_followers (list_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING', l.id, viewerId);

  const [found] = await publicItems(db, l.id, itemId, viewerId);
  if (!found) throw notFound();
  const item: PublicItem = { ...found, status: 'mine' };
  if (viewerId) return { item, undoToken: null };

  // The page needs the item to undo; the token alone proves it's yours.
  const link = `${baseURL.replace(/\/+$/, '')}/w/${token.trim()}?undo=${undo}&item=${item.id}`;
  await sendMail(
    env,
    email,
    `You’re getting ${item.name}`,
    `You said you’ll get ${item.name} from ${l.title}. Everyone else now sees it as taken.\n\nPlans changed? Undo it here:\n${link}\n`,
  );
  return { item, undoToken: undo };
}

/** Drops a reservation made through the link: a signed-in visitor's own, or a guest's with their undo token. */
export async function unreserve(db: D1Database, viewerId: string, b: Body): Promise<PublicItem> {
  const l = await openSharedList(db, str(b, 'token') ?? '');
  const itemId = int(b, 'itemId') ?? 0;
  if (await ownsShared(db, l, viewerId)) throw forbidden('This is your own list. Friends reserve here, you don’t.');
  const undo = (str(b, 'undoToken') ?? '').trim();
  let changed: number;
  if (undo) {
    changed = await run(
      db,
      `DELETE FROM reservations WHERE item_id = ? AND undo_token_hash = ? AND item_id IN (SELECT id FROM items WHERE list_id = ?)`,
      itemId, await hashToken(undo), l.id,
    );
  } else if (viewerId) {
    changed = await run(
      db,
      `DELETE FROM reservations WHERE item_id = ? AND user_id = ? AND source = 'web' AND item_id IN (SELECT id FROM items WHERE list_id = ?)`,
      itemId, viewerId, l.id,
    );
  } else {
    throw invalid('Sign in, or open the undo link from your email.');
  }
  if (changed === 0) throw notFound();
  const [item] = await publicItems(db, l.id, itemId, viewerId);
  if (!item) throw notFound();
  return item;
}
