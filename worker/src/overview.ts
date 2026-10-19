import type { OverviewResponse, PersonRef, PersonSummary, Profile, SearchResponse, SharedSummary, WishListSummary } from '../../src/lib/types';
import { CAN_SEE_LIST, people, personRef } from './access';
import { all, idList } from './db';
import type { User } from './env';
import { invalid } from './errors';
import { ITEM_ORDER } from './items';
import { firstOccasion, loadOccasions } from './occasions';
import { displayName, initials, runeLength, truncateRunes } from './util';

export function profileFor(user: User): Profile {
  const name = displayName(user);
  return { id: user.id, email: user.email, displayName: name, initials: initials(name) };
}

/** Everything the sidebar and home screen show. */
export async function overview(db: D1Database, user: User): Promise<OverviewResponse> {
  const me = user.id;

  // My wishlists. Counts and previews come from items only, never from reservations.
  const wishRows = await all<{ id: number; title: string; share_enabled: number; item_count: number; previews: string }>(
    db,
    `SELECT l.id, l.title, l.share_enabled,
       (SELECT COUNT(*) FROM items i WHERE i.list_id = l.id) AS item_count,
       (SELECT json_group_array(json_object('imageUrl', p.image_url, 'store', p.store))
          FROM (SELECT i.image_url, i.store FROM items i WHERE i.list_id = l.id${ITEM_ORDER} LIMIT 4) p) AS previews
     FROM lists l
     WHERE l.owner_id = ? AND l.kind = 'wish'
     ORDER BY l.position, l.created_at, l.id`,
    me,
  );

  // Gift ideas: person lists I own or plan.
  const personRows = await all<{ id: number; title: string; person_full_name: string; owner_id: string; idea_count: number }>(
    db,
    `SELECT l.id, l.title, l.person_full_name, l.owner_id, (SELECT COUNT(*) FROM items i WHERE i.list_id = l.id) AS idea_count
     FROM lists l
     WHERE l.kind = 'person' AND ${CAN_SEE_LIST}
     ORDER BY (l.owner_id = ?) DESC, l.position, l.created_at, l.id`,
    me, me, me,
  );

  // Shared with me: links I opened while signed in, still switched on, not my own.
  const sharedRows = await all<{ id: number; share_token: string; title: string; owner_id: string; item_count: number; taken_count: number; mine_count: number }>(
    db,
    `SELECT l.id, l.share_token, l.title, l.owner_id,
       COUNT(i.id) AS item_count, COUNT(r.item_id) AS taken_count,
       SUM(CASE WHEN r.user_id = ? THEN 1 ELSE 0 END) AS mine_count
     FROM list_followers f
     JOIN lists l ON l.id = f.list_id AND l.kind = 'wish' AND l.share_enabled = 1 AND l.owner_id <> ?
     LEFT JOIN items i ON i.list_id = l.id
     LEFT JOIN reservations r ON r.item_id = i.id
     WHERE f.user_id = ?
     GROUP BY l.id
     ORDER BY MAX(f.created_at) DESC, l.id`,
    me, me, me,
  );

  const personIds = personRows.map((r) => r.id);
  const occasions = await loadOccasions(db, [...wishRows.map((r) => r.id), ...personIds, ...sharedRows.map((r) => r.id)]);

  // Budget ticks per occasion. Mixed currencies are rare: the sum is CHF only.
  const cents = new Map<number, Record<number, number>>();
  const counts = new Map<number, Record<number, number>>();
  const planners = new Map<number, string[]>();
  const invited = new Map<number, PersonRef[]>();
  if (personIds.length > 0) {
    const pickRows = await all<{ list_id: number; occasion_id: number; sum: number; n: number }>(
      db,
      `SELECT o.list_id, o.id AS occasion_id, COALESCE(SUM(CASE WHEN i.currency = 'CHF' THEN i.price_cents END), 0) AS sum, COUNT(*) AS n
       FROM occasions o
       JOIN item_picks p ON p.occasion_id = o.id
       JOIN items i ON i.id = p.item_id
       WHERE o.list_id IN (SELECT value FROM json_each(?))
       GROUP BY o.list_id, o.id`,
      idList(personIds),
    );
    for (const r of pickRows) {
      cents.set(r.list_id, { ...cents.get(r.list_id), [r.occasion_id]: r.sum });
      counts.set(r.list_id, { ...counts.get(r.list_id), [r.occasion_id]: r.n });
    }

    // Co-planners: active members, plus the owner when I'm a member. Never me. Invites that haven't
    // been accepted come last, named by their email (like the person page).
    const memberRows = await all<{ list_id: number; id: number; user_id: string | null; email: string }>(
      db,
      `SELECT list_id, id, user_id, email FROM list_members WHERE list_id IN (SELECT value FROM json_each(?))
       ORDER BY status = 'invited', joined_at, id`,
      idList(personIds),
    );
    for (const m of memberRows) {
      if (m.user_id) planners.set(m.list_id, [...(planners.get(m.list_id) ?? []), m.user_id]);
      else invited.set(m.list_id, [...(invited.get(m.list_id) ?? []), personRef(`invite-${m.id}`, m.email.split('@')[0], me)]);
    }
  }
  for (const r of personRows) {
    if (r.owner_id !== me) planners.set(r.id, [r.owner_id, ...(planners.get(r.id) ?? [])]);
  }
  const refs = await people(db, [...[...planners.values()].flat(), ...sharedRows.map((r) => r.owner_id)], me);

  const lists: WishListSummary[] = wishRows.map((r) => ({
    id: r.id,
    title: r.title,
    itemCount: r.item_count,
    shared: Boolean(r.share_enabled),
    occasion: firstOccasion(occasions.get(r.id)),
    previews: JSON.parse(r.previews) as WishListSummary['previews'],
  }));
  const peopleOut: PersonSummary[] = personRows.map((r) => ({
    id: r.id,
    title: r.title,
    personFullName: r.person_full_name,
    ideaCount: r.idea_count,
    occasions: occasions.get(r.id) ?? [],
    pickedCentsByOccasion: cents.get(r.id) ?? {},
    pickedCountByOccasion: counts.get(r.id) ?? {},
    coPlanners: [...(planners.get(r.id) ?? []).filter((id) => id !== me).map((id) => refs.get(id)!), ...(invited.get(r.id) ?? [])],
    role: r.owner_id === me ? 'owner' : 'member',
  }));
  const shared: SharedSummary[] = sharedRows.map((r) => ({
    listId: r.id,
    token: r.share_token,
    title: r.title,
    owner: refs.get(r.owner_id)!,
    itemCount: r.item_count,
    takenCount: r.taken_count,
    mineCount: r.mine_count ?? 0,
    occasion: firstOccasion(occasions.get(r.id)),
  }));
  return { me: profileFor(user), lists, people: peopleOut, shared };
}

/**
 * Lists (by title or the person's full name) and items (by name) the user owns or plans. Lists
 * shared with the user aren't searched.
 */
export async function search(db: D1Database, userId: string, raw: string): Promise<SearchResponse> {
  let q = raw.trim();
  if (runeLength(q) < 2) throw invalid('Type at least two letters.');
  q = truncateRunes(q, 100);
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const lists = await all<{ id: number; kind: 'wish' | 'person'; title: string }>(
    db,
    `SELECT l.id, l.kind, l.title FROM lists l
     WHERE ${CAN_SEE_LIST} AND (l.title LIKE ? ESCAPE '\\' OR l.person_full_name LIKE ? ESCAPE '\\')
     ORDER BY l.title, l.id LIMIT 5`,
    userId, userId, pattern, pattern,
  );
  const items = await all<{ id: number; list_id: number; kind: 'wish' | 'person'; title: string; name: string }>(
    db,
    `SELECT i.id, l.id AS list_id, l.kind, l.title, i.name FROM items i JOIN lists l ON l.id = i.list_id
     WHERE ${CAN_SEE_LIST} AND i.name LIKE ? ESCAPE '\\'
     ORDER BY i.created_at DESC, i.id DESC LIMIT 10`,
    userId, userId, pattern,
  );
  return {
    lists: lists.map((l) => ({ id: l.id, kind: l.kind, title: l.title })),
    items: items.map((i) => ({ id: i.id, listId: i.list_id, listKind: i.kind, listTitle: i.title, name: i.name })),
  };
}
