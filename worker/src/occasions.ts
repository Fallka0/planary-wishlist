import type { Occasion } from '../../src/lib/types';
import { type Access, isOwner, listAccess } from './access';
import { daysBetween, daysIn, nextOccurrence, todayInZurich } from './dates';
import { all, first, idList, run } from './db';
import { invalid, notFound, oneOccasion } from './errors';
import { type Body, int, nullableInt, str } from './input';
import { runeLength, squash } from './util';

type OccasionRow = { list_id: number; id: number; label: string; month: number; day: number; year: number | null; budget_cents: number | null };

const toOccasion = (r: OccasionRow): Occasion => ({ id: r.id, label: r.label, month: r.month, day: r.day, year: r.year, budgetCents: r.budget_cents });

/** Merges a POST or PATCH body into an occasion and validates the result. */
function applyInput(b: Body, o: Occasion) {
  const label = str(b, 'label');
  const month = int(b, 'month');
  const day = int(b, 'day');
  const year = nullableInt(b, 'year');
  const budget = nullableInt(b, 'budgetCents');
  if (label !== undefined) o.label = squash(label);
  if (month !== undefined) o.month = month;
  if (day !== undefined) o.day = day;
  if (year !== undefined) o.year = year;
  if (budget !== undefined) o.budgetCents = budget;

  if (!o.label) throw invalid('Name the date, like Birthday.');
  if (runeLength(o.label) > 40) throw invalid('Keep the name under 40 characters.');
  if (o.month < 1 || o.month > 12) throw invalid('Pick a month.');
  if (o.year !== null && (o.year < 2000 || o.year > 2100)) throw invalid('Pick a year between 2000 and 2100, or leave it empty for every year.');
  if (o.budgetCents !== null && (o.budgetCents < 0 || o.budgetCents > 100_000_000_00)) throw invalid('That budget doesn’t look right.');
  // Any year: Feb 29 is fine and counts down to Feb 28 in other years.
  if (o.day < 1 || o.day > daysIn(o.month, o.year ?? 0)) throw invalid('That day doesn’t exist in that month.');
}

/** Owners on both kinds of list, co-planners on person lists. */
function requireEditor(a: Access) {
  if (a.kind === 'wish' && !isOwner(a)) throw notFound();
}

/** Adds a date. A wishlist can have one (409 one_occasion). */
export async function createOccasion(db: D1Database, userId: string, b: Body): Promise<Occasion> {
  const a = await listAccess(db, int(b, 'listId') ?? 0, userId);
  requireEditor(a);
  const o: Occasion = { id: 0, label: '', month: 0, day: 0, year: null, budgetCents: null };
  applyInput(b, o);
  // One statement, so two requests can't both add a wishlist's one date.
  const row = await first<{ id: number }>(
    db,
    `INSERT INTO occasions (list_id, label, month, day, year, budget_cents)
     SELECT ?, ?, ?, ?, ?, ? WHERE ? = 'person' OR NOT EXISTS (SELECT 1 FROM occasions WHERE list_id = ?)
     RETURNING id`,
    a.listId, o.label, o.month, o.day, o.year, o.budgetCents, a.kind, a.listId,
  );
  if (!row) throw oneOccasion();
  return { ...o, id: row.id };
}

async function occasionAccess(db: D1Database, occasionId: number, userId: string): Promise<Occasion> {
  const row = await first<OccasionRow>(db, 'SELECT list_id, id, label, month, day, year, budget_cents FROM occasions WHERE id = ?', occasionId);
  if (!row) throw notFound();
  requireEditor(await listAccess(db, row.list_id, userId));
  return toOccasion(row);
}

/** Changes a date or its budget. Left-out fields stay; year and budgetCents can be null. */
export async function updateOccasion(db: D1Database, userId: string, occasionId: number, b: Body): Promise<Occasion> {
  const o = await occasionAccess(db, occasionId, userId);
  applyInput(b, o);
  await run(db, 'UPDATE occasions SET label = ?, month = ?, day = ?, year = ?, budget_cents = ? WHERE id = ?', o.label, o.month, o.day, o.year, o.budgetCents, o.id);
  return o;
}

/** Removes a date and the picks that counted toward it. */
export async function deleteOccasion(db: D1Database, userId: string, occasionId: number) {
  await occasionAccess(db, occasionId, userId);
  await run(db, 'DELETE FROM occasions WHERE id = ?', occasionId);
}

/** Soonest next occurrence first; past one-off dates last. */
export function sortOccasions(occ: Occasion[]) {
  const from = todayInZurich();
  const key = (o: Occasion) => {
    const d = nextOccurrence(o, from);
    return d ? daysBetween(from, d) : Infinity;
  };
  occ.sort((a, b) => key(a) - key(b) || a.id - b.id);
}

/** Each list's occasions, soonest first. */
export async function loadOccasions(db: D1Database, listIds: number[]): Promise<Map<number, Occasion[]>> {
  const out = new Map<number, Occasion[]>();
  if (listIds.length === 0) return out;
  const rows = await all<OccasionRow>(
    db,
    'SELECT list_id, id, label, month, day, year, budget_cents FROM occasions WHERE list_id IN (SELECT value FROM json_each(?)) ORDER BY id',
    idList(listIds),
  );
  for (const r of rows) {
    const list = out.get(r.list_id) ?? [];
    list.push(toOccasion(r));
    out.set(r.list_id, list);
  }
  for (const occ of out.values()) sortOccasions(occ);
  return out;
}

export const firstOccasion = (occ: Occasion[] | undefined): Occasion | null => (occ && occ.length ? { ...occ[0] } : null);
