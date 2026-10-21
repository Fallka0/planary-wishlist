// Totals for the Planary Console, called by planary-org with a shared key. Totals only, by
// design: no route here returns a person, a list, an item or a reservation. A reported share
// link can be switched off by its list ID without anyone seeing what's on the list.
import type { Context } from 'hono';
import { all, first, NOW, run } from './db';
import type { Env } from './env';
import { notFound } from './errors';
import { newShareToken } from './util';

export interface WishlistTotals {
  lists: number;
  items: number;
  sharedLists: number;
  reservationsThisMonth: number;
  newListsPerWeek: number[];
  shopDomains: { domain: string; items: number }[];
}

const WEEKS = 12;

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

/** True when the request carries the configured key. Compared in constant time, on hashes so the length doesn't leak either. */
export async function hasInternalKey(c: Context<{ Bindings: Env }>): Promise<boolean> {
  const expected = c.env.INTERNAL_KEY ?? '';
  const given = c.req.header('x-internal-key') ?? '';
  if (!expected || !given) return false;
  const [a, b] = await Promise.all([digest(expected), digest(given)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function totals(db: D1Database, now = new Date()): Promise<WishlistTotals> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const since = new Date(now.getTime() - WEEKS * 7 * 86_400_000).toISOString();
  const [counts, weekly, domains] = await Promise.all([
    first<{ lists: number; items: number; shared: number; reservations: number }>(
      db,
      `SELECT (SELECT COUNT(*) FROM lists) AS lists,
              (SELECT COUNT(*) FROM items) AS items,
              (SELECT COUNT(*) FROM lists WHERE kind = 'wish' AND share_enabled = 1) AS shared,
              (SELECT COUNT(*) FROM reservations WHERE created_at >= ?) AS reservations`,
      monthStart,
    ),
    all<{ created_at: string }>(db, 'SELECT created_at FROM lists WHERE created_at >= ?', since),
    all<{ domain: string; items: number }>(
      db,
      `SELECT store AS domain, COUNT(*) AS items FROM items WHERE store <> ''
       GROUP BY store ORDER BY items DESC, store LIMIT 10`,
    ),
  ]);
  const newListsPerWeek = new Array<number>(WEEKS).fill(0);
  for (const { created_at } of weekly) {
    const weeksAgo = Math.floor((now.getTime() - Date.parse(created_at)) / (7 * 86_400_000));
    if (weeksAgo >= 0 && weeksAgo < WEEKS) newListsPerWeek[WEEKS - 1 - weeksAgo]++;
  }
  return {
    lists: counts?.lists ?? 0,
    items: counts?.items ?? 0,
    sharedLists: counts?.shared ?? 0,
    reservationsThisMonth: counts?.reservations ?? 0,
    newListsPerWeek,
    shopDomains: domains,
  };
}

/** Switches a reported share link off: sharing ends and the token changes, so the old link is dead. */
export async function disableShareLink(db: D1Database, listId: number): Promise<void> {
  const changed = await run(
    db,
    `UPDATE lists SET share_enabled = 0, share_token = ?, updated_at = ${NOW} WHERE id = ? AND kind = 'wish'`,
    newShareToken(), listId,
  );
  if (!changed) throw notFound();
}
