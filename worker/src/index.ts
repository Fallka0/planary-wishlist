// planary-wishlist: one Worker for wishlist.planary.ch. /api/* is the API below
// (docs/wishlist-v2/api/API.md); everything else is the web app from ../dist.
import { Hono, type Context } from 'hono';
import { userFromRequest } from './auth';
import { claim, setPick, unclaim } from './claims';
import { run } from './db';
import type { Env, User } from './env';
import { AppError, invalid, notFound } from './errors';
import { bool, int, readBody, str } from './input';
import { createItem, deleteItem, updateItem } from './items';
import { linkPreview } from './linkPreview';
import { createList, deleteList, getList, updateList } from './lists';
import { acceptInvite, invite, inviteLink, previewInvite, removeMember } from './members';
import { disableShareLink, hasInternalKey, totals } from './internal';
import { orgLists, syncOrgs } from './orgs';
import { createOccasion, deleteOccasion, updateOccasion } from './occasions';
import { overview, profileFor, search } from './overview';
import { publicList, reserve, rotateShareLink, setSharing, unreserve } from './sharing';
import { displayName } from './util';

type C = Context<{ Bindings: Env }>;

const app = new Hono<{ Bindings: Env }>();

// ── Helpers ──

/** Stores the caller's email and display name. Only a cache of names, so a failed write is logged, not fatal. */
async function upsertProfile(env: Env, user: User) {
  try {
    await run(
      env.DB,
      `INSERT INTO profiles (user_id, email, display_name) VALUES (?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE profiles.email IS NOT excluded.email OR profiles.display_name IS NOT excluded.display_name`,
      user.id, user.email, displayName(user),
    );
  } catch (e) {
    console.log(`upsert profile ${user.id}: ${e}`);
  }
}

const unauthorized = () => new AppError(401, 'unauthorized', 'Sign in to continue.');

async function requireUser(c: C): Promise<User> {
  const user = await userFromRequest(c.env, c.req.raw);
  if (!user) throw unauthorized();
  await upsertProfile(c.env, user);
  await syncOrgs(c.env, user).catch((e) => console.log(`org sync ${user.id}: ${e}`));
  return user;
}

/** The signed-in user on pages that also work without an account. A missing or expired token is a guest. */
async function optionalUser(c: C): Promise<User | null> {
  if (!c.req.header('authorization')?.trim()) return null;
  const user = await userFromRequest(c.env, c.req.raw);
  if (user) {
    await upsertProfile(c.env, user);
    await syncOrgs(c.env, user).catch((e) => console.log(`org sync ${user.id}: ${e}`));
  }
  return user;
}

/** A positive integer id from the query string. */
function queryId(c: C, key: string): number {
  const raw = c.req.query(key) ?? '';
  const id = /^\d+$/.test(raw) ? Number(raw) : 0;
  if (!Number.isSafeInteger(id) || id <= 0) throw invalid(`Missing or invalid ${key}.`);
  return id;
}

/** Where share and invite links point: PUBLIC_APP_URL, else the request's own origin. */
const baseURL = (c: C) => (c.env.PUBLIC_APP_URL || new URL(c.req.url).origin).replace(/\/+$/, '');

const clientIP = (c: C) => c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';

const methodNotAllowed = () => new AppError(405, 'invalid', 'Method not allowed.');

// ── Routes ──

// Answers are personal and change all the time: no browser or edge cache keeps them.
app.use('/api/*', async (c, next) => {
  await next();
  c.res.headers.set('Cache-Control', 'no-store');
});


app.get('/api/health', (c) => c.json({ status: 'ok' }));

app.get('/api/me', async (c) => c.json({ me: profileFor(await requireUser(c)) }));

app.get('/api/search', async (c) => {
  const user = await requireUser(c);
  return c.json(await search(c.env.DB, user.id, c.req.query('q') ?? ''));
});

app.get('/api/overview', async (c) => c.json(await overview(c.env.DB, await requireUser(c))));

app.post('/api/lists', async (c) => {
  const user = await requireUser(c);
  return c.json({ list: await createList(c.env, user, await readBody(c.req.raw), baseURL(c)) }, 201);
});
app.get('/api/lists', async (c) => {
  const user = await requireUser(c);
  return c.json({ list: await getList(c.env.DB, user.id, queryId(c, 'id'), baseURL(c)) });
});
app.patch('/api/lists', async (c) => {
  const user = await requireUser(c);
  const id = queryId(c, 'id');
  return c.json({ list: await updateList(c.env.DB, user.id, id, await readBody(c.req.raw), baseURL(c)) });
});
app.delete('/api/lists', async (c) => {
  const user = await requireUser(c);
  await deleteList(c.env.DB, user.id, queryId(c, 'id'));
  return c.body(null, 204);
});

app.post('/api/items', async (c) => {
  const user = await requireUser(c);
  return c.json({ item: await createItem(c.env.DB, user.id, await readBody(c.req.raw)) }, 201);
});
app.patch('/api/items', async (c) => {
  const user = await requireUser(c);
  const id = queryId(c, 'id');
  return c.json({ item: await updateItem(c.env.DB, user.id, id, await readBody(c.req.raw)) });
});
app.delete('/api/items', async (c) => {
  const user = await requireUser(c);
  await deleteItem(c.env.DB, user.id, queryId(c, 'id'));
  return c.body(null, 204);
});

// Signed in only, so it's no open proxy.
app.post('/api/link-preview', async (c) => {
  await requireUser(c);
  const body = await readBody(c.req.raw);
  return c.json({ preview: await linkPreview(str(body, 'url') ?? '') });
});

app.post('/api/occasions', async (c) => {
  const user = await requireUser(c);
  return c.json({ occasion: await createOccasion(c.env.DB, user.id, await readBody(c.req.raw)) }, 201);
});
app.patch('/api/occasions', async (c) => {
  const user = await requireUser(c);
  const id = queryId(c, 'id');
  return c.json({ occasion: await updateOccasion(c.env.DB, user.id, id, await readBody(c.req.raw)) });
});
app.delete('/api/occasions', async (c) => {
  const user = await requireUser(c);
  await deleteOccasion(c.env.DB, user.id, queryId(c, 'id'));
  return c.body(null, 204);
});

app.put('/api/picks', async (c) => {
  const user = await requireUser(c);
  const b = await readBody(c.req.raw);
  return c.json({ item: await setPick(c.env.DB, user.id, int(b, 'itemId') ?? 0, int(b, 'occasionId') ?? 0, bool(b, 'picked') ?? false) });
});

app.post('/api/claims', async (c) => {
  const user = await requireUser(c);
  return c.json({ item: await claim(c.env.DB, user.id, queryId(c, 'itemId')) });
});
app.delete('/api/claims', async (c) => {
  const user = await requireUser(c);
  return c.json({ item: await unclaim(c.env.DB, user.id, queryId(c, 'itemId')) });
});

app.put('/api/share', async (c) => {
  const user = await requireUser(c);
  const id = queryId(c, 'listId');
  const b = await readBody(c.req.raw);
  return c.json({ share: await setSharing(c.env.DB, user.id, id, bool(b, 'enabled') ?? false, baseURL(c)) });
});
app.post('/api/share/rotate', async (c) => {
  const user = await requireUser(c);
  return c.json({ share: await rotateShareLink(c.env.DB, user.id, queryId(c, 'listId'), baseURL(c)) });
});

// No account needed.
app.get('/api/public', async (c) => {
  const user = await optionalUser(c);
  return c.json(await publicList(c.env.DB, user?.id ?? '', c.req.query('token') ?? ''));
});
app.post('/api/public/reserve', async (c) => {
  const user = await optionalUser(c);
  return c.json(await reserve(c.env, user?.id ?? '', await readBody(c.req.raw), clientIP(c), baseURL(c)));
});
app.delete('/api/public/reserve', async (c) => {
  const user = await optionalUser(c);
  return c.json({ item: await unreserve(c.env.DB, user?.id ?? '', await readBody(c.req.raw)) });
});

app.post('/api/members', async (c) => {
  const user = await requireUser(c);
  const b = await readBody(c.req.raw);
  return c.json(await invite(c.env, user, int(b, 'listId') ?? 0, str(b, 'email') ?? '', baseURL(c)), 201);
});
app.delete('/api/members', async (c) => {
  const user = await requireUser(c);
  await removeMember(c.env.DB, user.id, queryId(c, 'id'));
  return c.body(null, 204);
});
app.post('/api/members/link', async (c) => {
  const user = await requireUser(c);
  return c.json({ inviteUrl: await inviteLink(c.env.DB, user.id, queryId(c, 'listId'), baseURL(c)) });
});

app.get('/api/invite', async (c) => {
  const user = await requireUser(c);
  return c.json(await previewInvite(c.env.DB, user.id, c.req.query('token') ?? ''));
});
app.post('/api/invite/accept', async (c) => {
  const user = await requireUser(c);
  const b = await readBody(c.req.raw);
  return c.json({ listId: await acceptInvite(c.env.DB, user, str(b, 'token') ?? '') });
});

// Console totals for planary-org. Without the shared key these routes answer like any unknown path.
app.get('/api/internal/totals', async (c) => {
  if (!(await hasInternalKey(c))) throw notFound();
  return c.json(await totals(c.env.DB));
});

// An organisation's wishlists for the Planary portal, totals per list only.
app.get('/api/internal/orgs/:orgId/lists', async (c) => {
  if (!(await hasInternalKey(c))) throw notFound();
  const orgId = c.req.param('orgId');
  if (!/^[\w-]{1,64}$/.test(orgId)) throw notFound();
  return c.json({ lists: await orgLists(c.env.DB, orgId) });
});

app.post('/api/internal/share-links/:listId/disable', async (c) => {
  if (!(await hasInternalKey(c))) throw notFound();
  const raw = c.req.param('listId');
  const id = /^\d+$/.test(raw) ? Number(raw) : 0;
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound();
  await disableShareLink(c.env.DB, id);
  return c.json({ ok: true });
});

// A known path with the wrong method is a 405; an unknown /api path a 404.
const KNOWN = new Set(
  ['health', 'me', 'search', 'overview', 'lists', 'items', 'link-preview', 'occasions', 'picks', 'claims', 'share', 'share/rotate',
    'public', 'public/reserve', 'members', 'members/link', 'invite', 'invite/accept'].map((p) => `/api/${p}`),
);
app.all('/api/*', (c) => {
  if (KNOWN.has(c.req.path)) throw methodNotAllowed();
  throw new AppError(404, 'not_found', 'We couldn’t find that.');
});

// Everything else is the web app (normally served before the Worker runs; this covers the rest).
app.all('*', (c) => (c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.notFound()));

// An AppError goes out as is; anything else is logged and hidden behind a 500.
app.onError((err, c) => {
  if (err instanceof AppError) {
    const body: Record<string, string> = { error: err.message, code: err.code };
    if (err.store) body.store = err.store;
    return c.json(body, err.status as 400);
  }
  console.log(`${c.req.method} ${c.req.path}: ${err.stack ?? err}`);
  return c.json({ error: 'Something went wrong on our side. Try again in a moment.', code: 'server' }, 500);
});

export default app;
