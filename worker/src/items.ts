import type { Idea, WishItem } from '../../src/lib/types';
import { type Access, isOwner, itemAccess, listAccess, people, personRef } from './access';
import { all, first, NOW, run } from './db';
import { forbidden, invalid, notFound } from './errors';
import { type Body, int, str } from './input';
import { cleanWebURL, currencyCode, runeLength, squash, storeFromURL, truncateRunes } from './util';

export const ITEM_ORDER = ' ORDER BY i.position, i.created_at DESC, i.id DESC';

interface Fields {
  name: string;
  url: string;
  imageUrl: string;
  store: string;
  note: string;
  priceCents: number;
  currency: string;
  priority: number;
}

/**
 * Merges a POST or PATCH body into an item and validates the result. Creating an item never fetches
 * the URL: the app fills the fields from /api/link-preview first.
 */
function applyInput(b: Body, f: Fields, kind: Access['kind']) {
  const name = str(b, 'name');
  const url = str(b, 'url');
  const imageUrl = str(b, 'imageUrl');
  const store = str(b, 'store');
  const note = str(b, 'note');
  const price = int(b, 'priceCents');
  const currency = str(b, 'currency');
  const priority = int(b, 'priority');

  let urlChanged = false;
  if (name !== undefined) f.name = squash(name);
  if (url !== undefined) {
    const u = cleanWebURL(url, 'The link');
    urlChanged = u !== f.url;
    f.url = u;
  }
  if (imageUrl !== undefined) f.imageUrl = cleanWebURL(imageUrl, 'The picture');
  if (store !== undefined && store.trim()) f.store = truncateRunes(store.trim(), 100).toLowerCase();
  else if (store !== undefined || urlChanged) f.store = storeFromURL(f.url);
  if (note !== undefined) f.note = note.trim();
  if (price !== undefined) f.priceCents = price;
  if (currency !== undefined) f.currency = currency.trim().toUpperCase();
  if (priority !== undefined && kind === 'wish') f.priority = priority;
  if (kind === 'person') f.priority = 2; // unused on person lists

  if (!f.name) throw invalid('Give it a name so you recognise it later.');
  if (runeLength(f.name) > 200) throw invalid('Keep the name under 200 characters.');
  if (runeLength(f.note) > 500) throw invalid('Keep the note under 500 characters.');
  if (f.priceCents < 0 || f.priceCents > 100_000_000_00) throw invalid('That price doesn’t look right.');
  if (!currencyCode(f.currency)) throw invalid('Use a three-letter currency code, like CHF.');
  if (f.priority < 1 || f.priority > 3) throw invalid('Pick must have, would love or nice to have.');
}

/** Owners change anything on their list; co-planners only the ideas they added. */
function canChange(a: Access, addedBy: string | null, userId: string) {
  if (a.kind === 'wish' && !isOwner(a)) throw notFound();
  if (isOwner(a) || addedBy === userId) return;
  throw forbidden('You can only change ideas you added.');
}

/** Adds an item to a wishlist (owner) or an idea to a person list (owner or co-planner). */
export async function createItem(db: D1Database, userId: string, b: Body): Promise<WishItem | Idea> {
  const a = await listAccess(db, int(b, 'listId') ?? 0, userId);
  if (a.kind === 'wish' && !isOwner(a)) throw notFound();
  const f: Fields = { name: '', url: '', imageUrl: '', store: '', note: '', priceCents: 0, currency: 'CHF', priority: 2 };
  applyInput(b, f, a.kind);
  const row = await first<{ id: number }>(
    db,
    `INSERT INTO items (list_id, name, url, image_url, store, note, price_cents, currency, priority, added_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    a.listId, f.name, f.url, f.imageUrl, f.store, f.note, f.priceCents, f.currency, f.priority, userId,
  );
  return loadItem(db, a, row!.id, userId);
}

/** Edits an item. Fields left out stay as they are. */
export async function updateItem(db: D1Database, userId: string, itemId: number, b: Body): Promise<WishItem | Idea> {
  const { access: a, addedBy } = await itemAccess(db, itemId, userId);
  canChange(a, addedBy, userId);
  const r = await first<{ name: string; url: string; image_url: string; store: string; note: string; price_cents: number; currency: string; priority: number }>(
    db,
    'SELECT name, url, image_url, store, note, price_cents, currency, priority FROM items WHERE id = ?',
    itemId,
  );
  if (!r) throw notFound();
  const f: Fields = { name: r.name, url: r.url, imageUrl: r.image_url, store: r.store, note: r.note, priceCents: r.price_cents, currency: r.currency, priority: r.priority };
  applyInput(b, f, a.kind);
  await run(
    db,
    `UPDATE items SET name = ?, url = ?, image_url = ?, store = ?, note = ?, price_cents = ?, currency = ?, priority = ?, updated_at = ${NOW}
     WHERE id = ?`,
    f.name, f.url, f.imageUrl, f.store, f.note, f.priceCents, f.currency, f.priority, itemId,
  );
  return loadItem(db, a, itemId, userId);
}

/** Removes an item, with its picks and any reservation. */
export async function deleteItem(db: D1Database, userId: string, itemId: number) {
  const { access: a, addedBy } = await itemAccess(db, itemId, userId);
  canChange(a, addedBy, userId);
  await run(db, 'DELETE FROM items WHERE id = ?', itemId);
}

/** A WishItem on a wishlist or an Idea on a person list. */
async function loadItem(db: D1Database, a: Access, itemId: number, userId: string): Promise<WishItem | Idea> {
  const items = a.kind === 'wish' ? await wishItems(db, a.listId, itemId) : await loadIdeas(db, a.listId, itemId, userId);
  if (items.length === 0) throw notFound();
  return items[0];
}

type WishRow = {
  id: number; list_id: number; name: string; url: string; image_url: string; store: string; note: string;
  price_cents: number; currency: string; priority: number; created_at: string;
};

/**
 * The items of a wishlist (all of them, or one when itemId isn't 0). It reads the items table only:
 * nothing about reservations can reach the owner from here.
 */
export async function wishItems(db: D1Database, listId: number, itemId = 0): Promise<WishItem[]> {
  const rows = await all<WishRow>(
    db,
    `SELECT i.id, i.list_id, i.name, i.url, i.image_url, i.store, i.note, i.price_cents, i.currency, i.priority, i.created_at
     FROM items i WHERE i.list_id = ? AND (? = 0 OR i.id = ?)` + ITEM_ORDER,
    listId, itemId, itemId,
  );
  return rows.map((r) => ({
    id: r.id, listId: r.list_id, name: r.name, url: r.url, imageUrl: r.image_url, store: r.store, note: r.note,
    priceCents: r.price_cents, currency: r.currency, priority: r.priority as WishItem['priority'], createdAt: r.created_at,
  }));
}

/** The ideas of a person list, with who added them, who's getting them and their picks. */
export async function loadIdeas(db: D1Database, listId: number, itemId: number, me: string): Promise<Idea[]> {
  const rows = await all<WishRow & { added_by: string | null; reserved: number; reserved_by: string | null; picks: string }>(
    db,
    `SELECT i.id, i.list_id, i.name, i.url, i.image_url, i.store, i.note, i.price_cents, i.currency, i.priority, i.created_at,
       i.added_by, r.item_id IS NOT NULL AS reserved, r.user_id AS reserved_by,
       (SELECT json_group_array(occasion_id) FROM (SELECT p.occasion_id FROM item_picks p WHERE p.item_id = i.id ORDER BY p.occasion_id)) AS picks
     FROM items i
     JOIN lists l ON l.id = i.list_id AND l.kind = 'person'
     LEFT JOIN reservations r ON r.item_id = i.id
     WHERE i.list_id = ? AND (? = 0 OR i.id = ?)` + ITEM_ORDER,
    listId, itemId, itemId,
  );
  const refs = await people(db, rows.flatMap((r) => [r.added_by ?? '', r.reserved_by ?? '']), me);
  const ref = (id: string | null) => (id ? refs.get(id)! : personRef('', '', me));
  return rows.map((r) => ({
    id: r.id, listId: r.list_id, name: r.name, url: r.url, imageUrl: r.image_url, store: r.store, note: r.note,
    priceCents: r.price_cents, currency: r.currency,
    addedBy: ref(r.added_by),
    reservedBy: r.reserved ? ref(r.reserved_by) : null,
    pickedFor: JSON.parse(r.picks) as number[],
    createdAt: r.created_at,
  }));
}
