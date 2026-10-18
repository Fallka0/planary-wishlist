// Small helpers over D1.

/** SQL for "now" in the format every timestamp column uses. */
export const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

/** A list of ids for `IN (SELECT value FROM json_each(?))`. */
export const idList = (ids: (number | string)[]) => JSON.stringify(ids);

export async function all<T>(db: D1Database, sql: string, ...args: unknown[]): Promise<T[]> {
  const res = await db.prepare(sql).bind(...args).all<T>();
  return res.results ?? [];
}

export async function first<T>(db: D1Database, sql: string, ...args: unknown[]): Promise<T | null> {
  return db.prepare(sql).bind(...args).first<T>();
}

/** Runs a statement and returns how many rows it changed. */
export async function run(db: D1Database, sql: string, ...args: unknown[]): Promise<number> {
  const res = await db.prepare(sql).bind(...args).run();
  return res.meta.changes ?? 0;
}
