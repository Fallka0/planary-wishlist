import type { Idea } from '../../src/lib/types';
import { type Access, isOwner, itemAccess } from './access';
import { first, run } from './db';
import { forbidden, invalid, notFound, taken } from './errors';
import { loadIdeas } from './items';

/**
 * An idea on a person list the user plans. Wishlist items are a 404 here, before anything about
 * their reservations is looked at.
 */
async function personIdeaAccess(db: D1Database, itemId: number, userId: string): Promise<Access> {
  const { access } = await itemAccess(db, itemId, userId);
  if (access.kind !== 'person') throw notFound();
  return access;
}

async function oneIdea(db: D1Database, listId: number, itemId: number, userId: string): Promise<Idea> {
  const ideas = await loadIdeas(db, listId, itemId, userId);
  if (ideas.length === 0) throw notFound();
  return ideas[0];
}

/** Ticks or unticks an idea toward an occasion's budget. */
export async function setPick(db: D1Database, userId: string, itemId: number, occasionId: number, picked: boolean): Promise<Idea> {
  const a = await personIdeaAccess(db, itemId, userId);
  const sameList = await first(db, 'SELECT 1 FROM occasions WHERE id = ? AND list_id = ?', occasionId, a.listId);
  if (!sameList) throw invalid('That date isn’t on this list.');
  if (picked) await run(db, 'INSERT INTO item_picks (item_id, occasion_id) VALUES (?, ?) ON CONFLICT DO NOTHING', itemId, occasionId);
  else await run(db, 'DELETE FROM item_picks WHERE item_id = ? AND occasion_id = ?', itemId, occasionId);
  return oneIdea(db, a.listId, itemId, userId);
}

/** "I'll get this" for the user. 409 taken when a co-planner has it. */
export async function claim(db: D1Database, userId: string, itemId: number): Promise<Idea> {
  const a = await personIdeaAccess(db, itemId, userId);
  await run(db, `INSERT INTO reservations (item_id, source, user_id) VALUES (?, 'member', ?) ON CONFLICT (item_id) DO NOTHING`, itemId, userId);
  const holder = await first<{ user_id: string | null }>(db, 'SELECT user_id FROM reservations WHERE item_id = ?', itemId);
  if (!holder || holder.user_id !== userId) throw taken();
  return oneIdea(db, a.listId, itemId, userId);
}

/** Drops a claim: your own, or anyone's if you own the list. */
export async function unclaim(db: D1Database, userId: string, itemId: number): Promise<Idea> {
  const a = await personIdeaAccess(db, itemId, userId);
  const holder = await first<{ user_id: string | null }>(db, 'SELECT user_id FROM reservations WHERE item_id = ?', itemId);
  if (holder) {
    if (!isOwner(a) && holder.user_id !== userId) throw forbidden('Only the person getting it can undo that.');
    await run(db, 'DELETE FROM reservations WHERE item_id = ?', itemId);
  }
  return oneIdea(db, a.listId, itemId, userId);
}
