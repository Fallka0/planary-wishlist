import type { ListDetail, PersonListDetail, ShareState, WishListDetail } from '../../src/lib/types';
import { type Access, isOwner, listAccess, people, requireOwner } from './access';
import { first, NOW, run } from './db';
import { invalid, notFound } from './errors';
import { type Body, str, strList } from './input';
import { loadIdeas, wishItems } from './items';
import { listMembers } from './members';
import { firstOccasion, loadOccasions } from './occasions';
import { runeLength, squash } from './util';

function cleanTitle(raw: string): string {
  const title = squash(raw);
  if (!title) throw invalid('Give the list a name.');
  if (runeLength(title) > 60) throw invalid('Keep the name under 60 characters.');
  return title;
}

function cleanNotes(lines: string[]): string {
  const kept: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(/\n/g, ' ').trim();
    if (!line) continue;
    if (runeLength(line) > 200) throw invalid('Keep each note under 200 characters.');
    kept.push(line);
  }
  if (kept.length > 20) throw invalid('That’s more than 20 notes. Combine a few.');
  return kept.join('\n');
}

const splitNotes = (joined: string) => joined.split('\n').map((l) => l.trim()).filter(Boolean);

/** Makes a wishlist or a person list owned by the user. */
export async function createList(db: D1Database, userId: string, b: Body, baseURL: string): Promise<ListDetail> {
  const kind = str(b, 'kind');
  if (kind !== 'wish' && kind !== 'person') throw invalid('Choose what kind of list this is.');
  const title = cleanTitle(str(b, 'title') ?? '');
  const row = await first<{ id: number }>(
    db,
    `INSERT INTO lists (owner_id, kind, title, position)
     VALUES (?, ?, ?, COALESCE((SELECT MAX(position) + 1 FROM lists WHERE owner_id = ? AND kind = ?), 0))
     RETURNING id`,
    userId, kind, title, userId, kind,
  );
  return getList(db, userId, row!.id, baseURL);
}

/** A WishListDetail or a PersonListDetail. */
export async function getList(db: D1Database, userId: string, listId: number, baseURL: string): Promise<ListDetail> {
  const a = await listAccess(db, listId, userId);
  return a.kind === 'wish' ? wishDetail(db, a, baseURL) : personDetail(db, a, userId);
}

/** Renames a list or edits a person's full name and notes. Owners only. */
export async function updateList(db: D1Database, userId: string, listId: number, b: Body, baseURL: string): Promise<ListDetail> {
  const a = await listAccess(db, listId, userId);
  requireOwner(a, 'Only the person who started this list can change it.');
  const title = str(b, 'title');
  const fullName = str(b, 'personFullName');
  const notes = strList(b, 'personNotes');

  const sets = [`updated_at = ${NOW}`];
  const args: unknown[] = [];
  if (title !== undefined) {
    sets.push('title = ?');
    args.push(cleanTitle(title));
  }
  if ((fullName !== undefined || notes !== undefined) && a.kind !== 'person') {
    throw invalid('Only gift idea lists have a full name and notes.');
  }
  if (fullName !== undefined) {
    const name = squash(fullName);
    if (runeLength(name) > 80) throw invalid('Keep the full name under 80 characters.');
    sets.push('person_full_name = ?');
    args.push(name);
  }
  if (notes !== undefined) {
    sets.push('person_notes = ?');
    args.push(cleanNotes(notes));
  }
  await run(db, `UPDATE lists SET ${sets.join(', ')} WHERE id = ?`, ...args, listId);
  return getList(db, userId, listId, baseURL);
}

/** Removes a list with everything on it. Owners only. */
export async function deleteList(db: D1Database, userId: string, listId: number) {
  const a = await listAccess(db, listId, userId);
  requireOwner(a, 'Only the person who started this list can delete it.');
  await run(db, 'DELETE FROM lists WHERE id = ?', listId);
}

export function shareState(enabled: boolean, token: string | null, baseURL: string): ShareState {
  if (!enabled || !token) return { enabled: false, url: null };
  return { enabled: true, url: `${baseURL.replace(/\/+$/, '')}/w/${token}` };
}

/** The owner's view of their wishlist. It never reads reservations. */
async function wishDetail(db: D1Database, a: Access, baseURL: string): Promise<WishListDetail> {
  if (!isOwner(a)) throw notFound();
  const row = await first<{ share_enabled: number; share_token: string | null }>(db, 'SELECT share_enabled, share_token FROM lists WHERE id = ?', a.listId);
  const occasions = await loadOccasions(db, [a.listId]);
  return {
    id: a.listId,
    kind: 'wish',
    title: a.title,
    occasion: firstOccasion(occasions.get(a.listId)),
    share: shareState(Boolean(row?.share_enabled), row?.share_token ?? null, baseURL),
    items: await wishItems(db, a.listId),
  };
}

async function personDetail(db: D1Database, a: Access, userId: string): Promise<PersonListDetail> {
  const row = await first<{ person_full_name: string; person_notes: string }>(db, 'SELECT person_full_name, person_notes FROM lists WHERE id = ?', a.listId);
  const occasions = await loadOccasions(db, [a.listId]);
  const owner = await people(db, [a.ownerId], userId);
  return {
    id: a.listId,
    kind: 'person',
    title: a.title,
    personFullName: row?.person_full_name ?? '',
    personNotes: splitNotes(row?.person_notes ?? ''),
    occasions: occasions.get(a.listId) ?? [],
    role: a.role,
    owner: owner.get(a.ownerId)!,
    members: await listMembers(db, a.listId, userId),
    items: await loadIdeas(db, a.listId, 0, userId),
  };
}
