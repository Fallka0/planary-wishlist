import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearAuthCache, userFromRequest } from '../src/auth';
import { daysBetween, daysIn, nextOccurrence } from '../src/dates';
import type { Env } from '../src/env';
import { allowedURL, extractMetadata, linkPreview, parsePriceFromText, parsePriceToCents } from '../src/linkPreview';
import { allowReservation, resetReservationLimit } from '../src/sharing';
import { displayName, hashToken, initials, newSecretToken, newShareToken, storeFromURL } from '../src/util';

const date = (s: string) => new Date(`${s}T00:00:00Z`);

describe('parsing', () => {
  it('reads prices', () => {
    for (const [input, want] of Object.entries({
      '349': 34900, '349.00': 34900, '349,90': 34990, "CHF 1'146.65": 114665, '1.146,65': 114665, '1,146.65': 114665,
      '€ 59.90': 5990, '': 0, free: 0, '-5': 500 /* the sign is stripped, never negative */, '0': 0,
    })) {
      expect(parsePriceToCents(input), input).toBe(want);
    }
    expect(parsePriceFromText('<span>Now only</span> <b>€ 49,90</b>')).toEqual([4990, 'EUR']);
    expect(parsePriceFromText('<p>chf 12.50</p>')).toEqual([1250, 'CHF']);
  });

  it('names the store', () => {
    for (const [input, want] of Object.entries({
      'https://www.galaxus.ch/en/s1/product/123': 'galaxus.ch', 'https://WWW.Digitec.CH:443/x?y=1': 'digitec.ch',
      'http://shop.example.com/mug#top': 'shop.example.com', 'zalando.ch/shoes': 'zalando.ch', 'https://www.ikea.com.': 'ikea.com.',
      '': '', '   ': '',
    })) {
      expect(storeFromURL(input), input).toBe(want);
    }
  });

  it('makes tokens', async () => {
    const [share, secret] = [newShareToken(), newSecretToken()];
    expect(share).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newSecretToken()).not.toBe(secret);
    expect(await hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('names people', () => {
    for (const [input, want] of Object.entries({ 'Noa Brunner': 'NB', 'noa.brunner': 'NB', Lea: 'LE', L: 'L', 'émile zola': 'ÉZ', 'Anna Maria Keller': 'AM', '': '?' })) {
      expect(initials(input), input).toBe(want);
    }
    expect(displayName({ id: '', email: 'noa@example.ch', name: ' Noa   Brunner ' })).toBe('Noa Brunner');
    expect(displayName({ id: '', email: 'noa.brunner@example.ch', name: '' })).toBe('noa.brunner');
    expect(displayName({ id: '', email: 'noa@example.ch', name: '  ' })).toBe('noa');
    expect(displayName({ id: '', email: '', name: '' })).toBe('');
  });
});

describe('dates', () => {
  it('finds the next occurrence', () => {
    const cases: [string, number, number, number | null, string, string | null][] = [
      ['later this year', 11, 2, null, '2026-10-16', '2026-11-02'],
      ['today counts', 10, 16, null, '2026-10-16', '2026-10-16'],
      ['already passed rolls over', 3, 14, null, '2026-10-16', '2027-03-14'],
      ['Feb 29 in a non-leap year is Feb 28', 2, 29, null, '2026-10-16', '2027-02-28'],
      ['Feb 29 in a leap year', 2, 29, null, '2027-10-16', '2028-02-29'],
      ['Dec 31 on Dec 31', 12, 31, null, '2026-12-31', '2026-12-31'],
      ['Jan 1 from Dec 31', 1, 1, null, '2026-12-31', '2027-01-01'],
      ['one-off in the future', 6, 20, 2027, '2026-10-16', '2027-06-20'],
      ['one-off in the past drops out', 6, 20, 2026, '2026-10-16', null],
    ];
    for (const [name, month, day, year, from, want] of cases) {
      expect(nextOccurrence({ month, day, year }, date(from))?.toISOString().slice(0, 10) ?? null, name).toBe(want);
    }
    expect(daysBetween(date('2026-10-16'), date('2026-11-02'))).toBe(17);
    expect(daysBetween(date('2026-10-24'), date('2026-10-26'))).toBe(2); // across the DST change
  });

  it('knows month lengths', () => {
    expect([daysIn(2, 0), daysIn(2, 2027), daysIn(2, 2028), daysIn(2, 2100), daysIn(4, 0), daysIn(12, 0)]).toEqual([29, 28, 29, 28, 30, 31]);
  });
});

describe('reservation rate limit', () => {
  afterEach(resetReservationLimit);

  it('allows 20 per IP per hour', () => {
    const now = Date.now();
    for (let i = 0; i < 20; i++) expect(allowReservation('1.2.3.4', now)).toBe(true);
    expect(allowReservation('1.2.3.4', now)).toBe(false);
    expect(allowReservation('5.6.7.8', now)).toBe(true);
    expect(allowReservation('1.2.3.4', now + 61 * 60_000)).toBe(true);
  });
});

describe('sign-in', () => {
  afterEach(clearAuthCache);

  it('asks planary-auth once per token and caches the answer', async () => {
    const asked: string[] = [];
    const env = {
      AUTH: {
        async fetch(req: Request) {
          asked.push(`${new URL(req.url).pathname} ${req.headers.get('authorization')}`);
          if (req.headers.get('authorization') !== 'Bearer good') return Response.json({ error: 'not authenticated' }, { status: 401 });
          return Response.json({ user: { id: '11111111-1111-4111-8111-111111111111', email: 'noa@example.ch', name: 'Noa Brunner', createdAt: '2026-09-18T00:00:00Z' } });
        },
      },
    } as unknown as Env;
    const req = (header?: string) => new Request('https://wishlist.test/api/me', { headers: header ? { Authorization: header } : {} });

    expect(await userFromRequest(env, req('Bearer good'))).toEqual({ id: '11111111-1111-4111-8111-111111111111', email: 'noa@example.ch', name: 'Noa Brunner' });
    expect(await userFromRequest(env, req('Bearer good'))).not.toBeNull();
    expect(asked).toEqual(['/api/auth/me Bearer good']);
    for (const h of [undefined, 'Bearer ', 'Basic abc', 'Bearer bad']) {
      expect(await userFromRequest(env, req(h)), String(h)).toBeNull();
    }
  });
});

describe('link preview', () => {
  afterEach(() => vi.restoreAllMocks());

  it('only fetches public web addresses on the default ports', () => {
    for (const [raw, want] of Object.entries({
      'https://www.galaxus.ch/p/1': true, 'http://shop.ch:80/x': true, 'https://shop.ch:443/x': true,
      'https://shop.ch:8443/x': false, 'http://shop.ch:22/': false, 'ftp://shop.ch/file': false, 'file:///etc/passwd': false,
      'https://user:pw@shop.ch/': false, 'http://localhost/': false, 'http://printer.local/': false, 'http://metadata.google.internal/': false,
      'http://127.0.0.1/': false, 'http://10.1.2.3/': false, 'http://172.16.0.1/': false, 'http://192.168.1.1/': false,
      'http://169.254.169.254/': false, 'http://100.64.0.1/': false, 'http://0.0.0.0/': false, 'http://[::1]/': false,
      'http://[::ffff:10.0.0.1]/': false, 'http://2130706433/': false, 'http://8.8.8.8/': true, 'http://172.32.0.1/': true,
    })) {
      expect(allowedURL(new URL(raw)), raw).toBe(want);
    }
  });

  it('reads Open Graph and JSON-LD', () => {
    expect(extractMetadata(`<html><head>
<meta property="og:title" content="Sony WH-1000XM5 &amp; case">
<meta property="og:image" content="/img/xm5.jpg">
<meta property="product:price:amount" content="349.00">
<meta property="product:price:currency" content="chf">
</head></html>`)).toEqual({ title: 'Sony WH-1000XM5 & case', imageUrl: '/img/xm5.jpg', priceCents: 34900, currency: 'CHF' });
    expect(extractMetadata(`<script type="application/ld+json">{"@type":"Product","name":"Lamp","image":["https://cdn.example/lamp.png"],
"offers":{"@type":"Offer","price":59.9,"priceCurrency":"EUR"}}</script>`)).toEqual({ title: 'Lamp', imageUrl: 'https://cdn.example/lamp.png', priceCents: 5990, currency: 'EUR' });
  });

  /** Fake web: path → response. Every fetch is recorded. */
  function web(pages: Record<string, () => Response>) {
    const seen: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      seen.push(url.href);
      const page = pages[url.pathname];
      return page ? page() : new Response('missing', { status: 404 });
    });
    return seen;
  }
  const redirect = (to: string) => () => new Response(null, { status: 302, headers: { Location: to } });
  const html = (body: string, type = 'text/html; charset=utf-8') => () => new Response(body, { headers: { 'Content-Type': type } });

  it('builds a preview and resolves the picture against the final page', async () => {
    web({
      '/go': redirect('/headphones'),
      '/headphones': html('<meta property="og:title" content="XM5"><meta property="og:image" content="/img/xm5.jpg"><p>CHF 349.00</p>'),
    });
    expect(await linkPreview('shop.example/go')).toEqual({
      url: 'https://shop.example/go', store: 'shop.example', title: 'XM5', imageUrl: 'https://shop.example/img/xm5.jpg', priceCents: 34900, currency: 'CHF',
    });
  });

  it('checks every redirect and gives up after three', async () => {
    const seen = web({
      '/metadata': redirect('http://169.254.169.254/latest/meta-data/'),
      '/mapped': redirect('http://[::ffff:10.0.0.1]/'),
      '/scheme': redirect('file:///etc/passwd'),
      '/loop': redirect('/loop'),
      '/twice': redirect('/once'),
      '/once': redirect('/ok'),
      '/ok': html('<title>ok</title>'),
    });
    for (const path of ['/metadata', '/mapped', '/scheme', '/loop']) {
      await expect(linkPreview(`https://shop.example${path}`), path).rejects.toMatchObject({ status: 422, code: 'unreadable', store: 'shop.example' });
    }
    expect(seen.some((u) => !u.startsWith('https://shop.example/'))).toBe(false); // never left the public host
    expect((await linkPreview('https://shop.example/twice')).title).toBe('ok');
  });

  it('says which store it couldn’t read', async () => {
    web({ '/empty': html('<html><body>No product here</body></html>'), '/pdf': html('%PDF', 'application/pdf') });
    for (const path of ['/empty', '/pdf', '/gone']) {
      await expect(linkPreview(`https://shop.example${path}`), path).rejects.toMatchObject({ status: 422, code: 'unreadable', store: 'shop.example' });
    }
    await expect(linkPreview('javascript:alert(1)')).rejects.toMatchObject({ status: 400, code: 'invalid' });
  });
});
