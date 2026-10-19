// The Add dialog's link preview: name, picture and price from a product page (Open Graph, JSON-LD,
// then price hints in the text). Same rules as the Go version this replaced.
import type { LinkPreview } from '../../src/lib/types';
import { AppError, invalid } from './errors';
import { cleanWebURL, currencyCode, firstNonEmpty, storeFromURL, truncateRunes } from './util';

const MAX_BODY = 2 << 20;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8000;

export interface Metadata {
  title: string;
  imageUrl: string;
  priceCents: number;
  currency: string; // ISO 4217 when the page names one, else ""
}

// ── Where the preview may connect ──
// Users name these pages, so the preview only fetches public http(s) addresses on the default ports.
// A Worker can't reach a private network, but literal private addresses and odd ports are refused
// anyway, at every redirect.

function blockedIPv4(host: string): boolean {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0)
  );
}

export function allowedURL(u: URL): boolean {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (u.port !== '' && u.port !== '80' && u.port !== '443') return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (host.startsWith('[')) return false; // IPv6 literals: no product page lives at one
  return !blockedIPv4(host);
}

async function safeGet(raw: string): Promise<{ res: Response; finalURL: string }> {
  let url = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = new URL(url);
    if (!allowedURL(u)) throw new Error('address not allowed');
    const res = await fetch(u.href, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'User-Agent': 'PlanaryWishlistBot/2.0 (+https://planary.ch/wishlist)',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
    });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, u).href;
      continue;
    }
    return { res, finalURL: u.href };
  }
  throw new Error('too many redirects');
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BODY) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  const all = new Uint8Array(Math.min(size, MAX_BODY));
  let at = 0;
  for (const c of chunks) {
    const part = c.subarray(0, all.length - at);
    all.set(part, at);
    at += part.length;
    if (at >= all.length) break;
  }
  return new TextDecoder().decode(all);
}

/** Reads name, picture and price from a product page. No readable title is a 422 "unreadable" with the store. */
export async function linkPreview(rawURL: string): Promise<LinkPreview> {
  const cleaned = cleanWebURL(rawURL, 'The link');
  if (!cleaned) throw invalid('Paste a link first.');
  const store = storeFromURL(cleaned);
  const unreadable = () => new AppError(422, 'unreadable', `We couldn’t read details from ${store}.`, store);

  let meta: Metadata;
  try {
    const { res, finalURL } = await safeGet(cleaned);
    if (res.status < 200 || res.status >= 400) throw unreadable();
    const type = res.headers.get('content-type');
    if (type && !type.toLowerCase().includes('html')) throw unreadable();
    meta = extractMetadata(await readCapped(res));
    meta.imageUrl = resolveURL(finalURL, meta.imageUrl); // after redirects
  } catch {
    throw unreadable();
  }
  if (!meta.title) throw unreadable();

  let image = meta.imageUrl;
  try {
    const u = new URL(image);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') image = '';
  } catch {
    image = '';
  }
  return { url: cleaned, store, title: truncateRunes(meta.title, 200), imageUrl: image, priceCents: meta.priceCents, currency: meta.currency || 'CHF' };
}

// ── Parsing ──

const META_TAG = /<meta\s+[^>]*(?:property|name|itemprop)\s*=\s*['"]?([^'">\s]+)['"]?[^>]*content\s*=\s*['"]([^'"]+)['"][^>]*>/gis;
const TITLE_TAG = /<title[^>]*>(.*?)<\/title>/is;
const LD_JSON = /<script[^>]*type=['"]application\/ld\+json['"][^>]*>(.*?)<\/script>/gis;
const PRICE_HINT = /(CHF|EUR|USD|\$|£|€)\s*([0-9]+(?:[.,][0-9]{2})?)/i;
const STRIP_TAGS = /<[^>]+>/gs;
const SYMBOLS: Record<string, string> = { CHF: 'CHF', EUR: 'EUR', USD: 'USD', $: 'USD', '£': 'GBP', '€': 'EUR' };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', euro: '€', pound: '£', reg: '®', trade: '™', copy: '©' };

/** Decodes the HTML entities product pages use in titles and URLs. */
export function unescapeHTML(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, ent: string) => {
    if (ent[0] === '#') {
      const code = ent[1].toLowerCase() === 'x' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[ent.toLowerCase()] ?? whole;
  });
}

export function extractMetadata(html: string): Metadata {
  const values = new Map<string, string>();
  for (const m of html.matchAll(META_TAG)) {
    const key = m[1].trim().toLowerCase();
    if (!values.has(key)) values.set(key, m[2].trim());
  }
  const v = (k: string) => values.get(k) ?? '';
  const meta: Metadata = {
    title: firstNonEmpty(v('og:title'), v('twitter:title'), v('title'), titleTag(html)),
    imageUrl: firstNonEmpty(v('og:image'), v('og:image:url'), v('twitter:image'), v('image')),
    priceCents: firstPositive(parsePriceToCents(v('product:price:amount')), parsePriceToCents(v('og:price:amount')), parsePriceToCents(v('price')), parsePriceToCents(v('product:price'))),
    currency: firstNonEmpty(currencyCode(v('product:price:currency')), currencyCode(v('og:price:currency')), currencyCode(v('pricecurrency'))),
  };

  if (!meta.imageUrl || !meta.priceCents || !meta.title || !meta.currency) {
    const ld = metadataFromJSONLD(html);
    meta.title = firstNonEmpty(meta.title, ld.title);
    meta.imageUrl = firstNonEmpty(meta.imageUrl, ld.imageUrl);
    if (!meta.priceCents && ld.priceCents > 0) {
      meta.priceCents = ld.priceCents;
      meta.currency = firstNonEmpty(ld.currency, meta.currency);
    }
    meta.currency = firstNonEmpty(meta.currency, ld.currency);
  }
  if (!meta.priceCents) {
    const [cents, currency] = parsePriceFromText(html);
    meta.priceCents = cents;
    meta.currency = firstNonEmpty(meta.currency, currency);
  }
  meta.title = unescapeHTML(meta.title);
  meta.imageUrl = unescapeHTML(meta.imageUrl);
  return meta;
}

const empty = (): Metadata => ({ title: '', imageUrl: '', priceCents: 0, currency: '' });
const found = (m: Metadata) => Boolean(m.title || m.imageUrl || m.priceCents > 0);

function metadataFromJSONLD(html: string): Metadata {
  for (const m of html.matchAll(LD_JSON)) {
    let payload: unknown;
    try {
      payload = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const meta = fromJSON(payload);
    if (found(meta)) return meta;
  }
  return empty();
}

const strOf = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function fromJSON(value: unknown): Metadata {
  if (Array.isArray(value)) {
    for (const item of value) {
      const meta = fromJSON(item);
      if (found(meta)) return meta;
    }
  } else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const meta: Metadata = { title: strOf(o.name), imageUrl: imageOf(o.image), priceCents: 0, currency: '' };
    if (o.offers != null) [meta.priceCents, meta.currency] = priceFromOffers(o.offers);
    if (!meta.priceCents) {
      meta.priceCents = parsePriceToCents(strOf(o.price));
      meta.currency = currencyCode(strOf(o.priceCurrency));
    }
    if (found(meta)) return meta;
    for (const child of Object.values(o)) {
      const m = fromJSON(child);
      if (found(m)) return m;
    }
  }
  return empty();
}

function priceFromOffers(value: unknown): [number, string] {
  if (Array.isArray(value)) {
    for (const offer of value) {
      const [p, c] = priceFromOffers(offer);
      if (p > 0) return [p, c];
    }
  } else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    let price = parsePriceToCents(firstNonEmpty(strOf(o.price), strOf(o.lowPrice)));
    if (!price && typeof o.price === 'number') price = parsePriceToCents(String(o.price));
    if (price > 0) return [price, currencyCode(strOf(o.priceCurrency))];
    if (o.priceSpecification != null) return priceFromOffers(o.priceSpecification);
  }
  return [0, ''];
}

function imageOf(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const c = imageOf(item);
      if (c) return c;
    }
  } else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return firstNonEmpty(strOf(o.url), strOf(o.contentUrl));
  }
  return '';
}

function titleTag(html: string): string {
  const m = TITLE_TAG.exec(html);
  return m ? m[1].replace(STRIP_TAGS, ' ').replace(/\s+/g, ' ').trim() : '';
}

const firstPositive = (...values: number[]) => values.find((v) => v > 0) ?? 0;

/** "349", "349,90", "CHF 1'146.65", "1.146,65" → cents. Anything else is 0. */
export function parsePriceToCents(raw: string): number {
  let s = raw.trim().replace(/[^0-9.,]/g, '');
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if ((s.match(/,/g) ?? []).length === 1 && !s.includes('.')) {
    s = s.replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  const value = Number.parseFloat(s);
  if (!Number.isFinite(value) || value <= 0 || !/^\d*\.?\d*$/.test(s)) return 0;
  return Math.round(value * 100);
}

export function parsePriceFromText(html: string): [number, string] {
  const m = PRICE_HINT.exec(html.replace(STRIP_TAGS, ' '));
  if (!m) return [0, ''];
  return [parsePriceToCents(m[2]), SYMBOLS[m[1].toUpperCase()] ?? SYMBOLS[m[1]] ?? ''];
}

function resolveURL(pageURL: string, asset: string): string {
  asset = asset.trim();
  if (!asset) return '';
  try {
    return new URL(asset, pageURL).href;
  } catch {
    return asset;
  }
}
