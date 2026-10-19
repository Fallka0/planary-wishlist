import { invalid } from './errors';
import type { User } from './env';

// ── Text ──

/** Collapses runs of whitespace and trims: "  Noa   Brunner " → "Noa Brunner". */
export const squash = (s: string) => s.trim().split(/\s+/u).filter(Boolean).join(' ');

/** Length in characters, not UTF-16 units, like the database's length(). */
export const runeLength = (s: string) => [...s].length;

export function truncateRunes(s: string, n: number): string {
  const chars = [...s];
  return chars.length <= n ? s : chars.slice(0, n).join('').trim();
}

export function firstNonEmpty(...values: (string | undefined)[]): string {
  for (const v of values) if (v && v.trim()) return v.trim();
  return '';
}

/**
 * Two letters for avatars: the first letters of the first two words of the name, or the first two
 * letters of a one-word name. "Noa Brunner" → "NB", "noa.brunner" → "NB", "Lea" → "LE".
 */
export function initials(name: string): string {
  const words = name.split(/[\s._@-]+/u).filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.length >= 2 ? [...words[0]][0] + [...words[1]][0] : [...words[0]].slice(0, 2).join('');
  return letters.toUpperCase();
}

/** The name shown for a user: their Planary account name, else their email's local part. */
export function displayName(u: User): string {
  return squash(u.name ?? '') || (u.email ?? '').split('@')[0].trim();
}

// ── Addresses ──

/** The shop shown under an item: the host, lowercase, without "www." or a port. */
export function storeFromURL(raw: string): string {
  raw = raw.trim();
  if (!raw) return '';
  if (!raw.includes('://')) raw = `https://${raw}`;
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** An empty string or an http(s) URL with a host. A bare "shop.ch/x" gets https://. */
export function cleanWebURL(raw: string, field: string): string {
  raw = raw.trim();
  if (!raw) return '';
  if (raw.length > 2000) throw invalid(`${field} is too long.`);
  if (!raw.includes('://')) raw = `https://${raw}`;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw invalid(`${field} needs to be a web address.`);
  }
  if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !u.hostname) throw invalid(`${field} needs to be a web address.`);
  return u.href;
}

/** A single plain address ("name@example.ch"), lowercased. */
export function cleanEmail(raw: string): string {
  const email = raw.trim();
  if (email.length > 254 || !/^[^\s@"<>(),;:\\[\]]+@[^\s@"<>(),;:\\[\]]+\.[^\s@"<>(),;:\\[\].]+$/u.test(email)) {
    throw invalid('That email address doesn’t look right.');
  }
  return email.toLowerCase();
}

/** An ISO 4217 code, or "" when value isn't one. */
export function currencyCode(value: string): string {
  const v = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(v) ? v : '';
}

// ── Tokens ──

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomToken(n: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(n)));
}

/** Share tokens are 16 bytes and stored as is. Undo and invite tokens are 32 bytes and stored hashed. */
export const newShareToken = () => randomToken(16);
export const newSecretToken = () => randomToken(32);

/** How undo and invite tokens are stored: sha256, hex. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
