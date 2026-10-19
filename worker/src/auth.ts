// Sign-in: auth.planary.ch (planary-auth) signs people in and hands apps a short-lived access token;
// the Worker confirms it with planary-auth's /api/auth/me over the service binding.
import type { Env, User } from './env';
import { hashToken } from './util';

/** How long a confirmed token is trusted without asking planary-auth again. Tokens live an hour. */
const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { user: User; until: number }>();

function bearer(req: Request): string | null {
  const value = req.headers.get('authorization')?.trim() ?? '';
  const m = /^Bearer\s+(\S.*)$/i.exec(value);
  return m ? m[1].trim() : null;
}

async function askAuth(env: Env, token: string): Promise<User | null> {
  const init = { headers: { Authorization: `Bearer ${token}` } };
  const res = env.AUTH_API_URL
    ? await fetch(`${env.AUTH_API_URL.replace(/\/+$/, '')}/api/auth/me`, init)
    : await env.AUTH.fetch(new Request('https://auth.internal/api/auth/me', init));
  if (!res.ok) return null;
  const body = (await res.json()) as { user?: Partial<User> };
  if (!body.user?.id) return null;
  return { id: body.user.id, email: body.user.email ?? '', name: body.user.name ?? '' };
}

/** The signed-in Planary account behind the request's bearer token, or null. */
export async function userFromRequest(env: Env, req: Request): Promise<User | null> {
  const token = bearer(req);
  if (!token) return null;
  const key = await hashToken(token);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now < hit.until) return hit.user;

  const user = await askAuth(env, token);
  if (!user) return null;
  if (cache.size > 10_000) {
    for (const [k, v] of cache) if (v.until <= now) cache.delete(k);
  }
  cache.set(key, { user, until: now + CACHE_MS });
  return user;
}

/** Tests sign in as different people with the same fake tokens; they start each case clean. */
export function clearAuthCache() {
  cache.clear();
}
