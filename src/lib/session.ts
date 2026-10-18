// Planary sessions, as on casino.planary.ch: auth.planary.ch signs people in and hands us an access
// token (plus a refresh token) in the URL hash. We keep both in this browser, renew the access
// token before it runs out, and the API checks it with planary-auth on every request.

export const AUTH_BASE_URL: string = import.meta.env.VITE_AUTH_BASE_URL || 'https://auth.planary.ch';

const KEY = 'planary.session';

export interface Session {
  accessToken: string;
  refreshToken: string | null;
  userId: string;
  email: string;
  name: string;
  /** Epoch seconds. */
  expiresAt: number;
}

interface Claims {
  sub?: string;
  email?: string;
  name?: string;
  exp?: number;
}

function decodeJwt(token: string): Claims | null {
  try {
    const payload = token.split('.')[1];
    const binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '='));
    // Names can contain any characters, so decode the bytes as UTF-8.
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))) as Claims;
  } catch {
    return null;
  }
}

export function sessionFromTokens(accessToken: string, refreshToken: string | null): Session | null {
  const claims = decodeJwt(accessToken);
  if (!claims?.sub || !claims.exp) return null;
  const email = claims.email ?? '';
  return {
    accessToken,
    refreshToken,
    userId: claims.sub,
    email,
    name: claims.name || email.split('@')[0] || '',
    expiresAt: claims.exp,
  };
}

/** Picks up `#access_token=…&refresh_token=…` after the redirect back from planary-auth and cleans the URL. */
export function absorbSessionFromHash(): Session | null {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const accessToken = params.get('access_token');
  if (!accessToken && !params.has('sso')) return null;
  window.history.replaceState(window.history.state, document.title, `${window.location.pathname}${window.location.search}`);
  if (!accessToken) return null;
  const session = sessionFromTokens(accessToken, params.get('refresh_token'));
  if (session) saveSession(session);
  return session;
}

/** The stored session, refreshable or not. Use getAccessToken() for requests. */
export function loadSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    if (!session.accessToken || !session.userId) return null;
    if (isExpired(session) && !session.refreshToken) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Storage blocked: the session lasts for this page view only.
  }
  current = session;
}

export function clearSession() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
  current = null;
}

let current: Session | null = null;

/** The session for this page view, read once from storage. */
export function getSession(): Session | null {
  if (current === null) current = loadSession();
  return current;
}

/** Treat tokens within a minute of expiry as expired. */
function isExpired(session: Session, now = Date.now()) {
  return session.expiresAt * 1000 < now + 60_000;
}

let refreshing: Promise<Session | null> | null = null;

/** Swaps the refresh token for a new pair. Every refresh token works once, so only one runs at a time. */
export function refreshSession(): Promise<Session | null> {
  if (refreshing) return refreshing;
  const session = getSession();
  if (!session?.refreshToken) return Promise.resolve(null);
  refreshing = (async () => {
    try {
      const res = await fetch(`${AUTH_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refreshToken }),
      });
      if (!res.ok) {
        clearSession();
        return null;
      }
      const body = (await res.json()) as { access_token: string; refresh_token: string };
      const next = sessionFromTokens(body.access_token, body.refresh_token);
      if (next) saveSession(next);
      else clearSession();
      return next;
    } catch {
      return null; // offline: keep the session and try again next time
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** A valid access token, renewed first when it's about to run out. Null when signed out. */
export async function getAccessToken(): Promise<string | null> {
  const session = getSession();
  if (!session) return null;
  if (!isExpired(session)) return session.accessToken;
  return (await refreshSession())?.accessToken ?? null;
}

/** auth.planary.ch with returnTo. auto=1 sends someone already signed in straight back. */
export function signInUrl(returnTo = window.location.href): string {
  const target = new URL('/', AUTH_BASE_URL);
  target.searchParams.set('returnTo', returnTo);
  target.searchParams.set('auto', '1');
  return target.toString();
}

/** The Planary account page (name, password, sign out). */
export function accountUrl(returnTo = window.location.href): string {
  const target = new URL('/account', AUTH_BASE_URL);
  target.searchParams.set('returnTo', returnTo);
  return target.toString();
}

export function redirectToSignIn(returnTo = window.location.href) {
  window.location.assign(signInUrl(returnTo));
}
