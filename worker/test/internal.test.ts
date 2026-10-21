// The Console's totals: behind the shared key, and nothing in them points at a person or a list.
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import app from '../src/index';
import { call, fails, newItem, newList, newUser, ok, shareToken } from './helpers';

const KEY = 'test-internal-key';

async function internal(method: string, target: string, key: string | null = KEY) {
  const res = await app.request(target, { method, headers: key ? { 'X-Internal-Key': key } : {} }, env);
  const raw = await res.text();
  return { status: res.status, raw, body: raw ? JSON.parse(raw) : null };
}

describe('internal routes', () => {
  it('look like unknown paths without the right key', async () => {
    for (const key of [null, '', 'wrong', `${KEY}x`]) {
      fails(await internal('GET', '/api/internal/totals', key), 404, 'not_found', `totals with key ${key}`);
      fails(await internal('POST', '/api/internal/share-links/1/disable', key), 404, 'not_found', `disable with key ${key}`);
    }
  });

  it('count totals without naming anyone or anything', async () => {
    const before = ok(await internal('GET', '/api/internal/totals'), 200, 'totals before').body;

    const noa = newUser('Noa Brunner');
    const list = await newList(noa, 'wish', 'Secret ski season');
    const goggles = await newItem(noa, list, 'Ski goggles', 12900);
    await newItem(noa, list, 'Gloves', 4900);
    const token = await shareToken(noa, list);
    const lea = newUser('Lea Keller');
    ok(await call(lea, 'POST', '/api/public/reserve', { token, itemId: goggles }), 200, 'Lea reserves');

    const res = ok(await internal('GET', '/api/internal/totals'), 200, 'totals');
    const t = res.body;
    expect(t.lists).toBe(before.lists + 1);
    expect(t.items).toBe(before.items + 2);
    expect(t.sharedLists).toBe(before.sharedLists + 1);
    expect(t.reservationsThisMonth).toBe(before.reservationsThisMonth + 1);
    expect(t.newListsPerWeek).toHaveLength(12);
    expect(t.newListsPerWeek[11]).toBeGreaterThanOrEqual(1);
    expect(t.shopDomains).toContainEqual({ domain: 'galaxus.ch', items: expect.any(Number) });
    expect(Object.keys(t).sort()).toEqual(['items', 'lists', 'newListsPerWeek', 'reservationsThisMonth', 'sharedLists', 'shopDomains']);

    for (const secret of [noa.name, noa.email, noa.id, lea.name, lea.email, lea.id, 'Secret ski season', 'Ski goggles', 'Gloves', token]) {
      expect(res.raw, `totals leak ${secret}`).not.toContain(secret);
    }
  });

  it('switches a reported share link off without showing the list', async () => {
    const noa = newUser('Noa Brunner');
    const list = await newList(noa, 'wish', 'Birthday');
    await newItem(noa, list, 'Book', 2500);
    const token = await shareToken(noa, list);
    ok(await call(null, 'GET', `/api/public?token=${token}`), 200, 'link works');

    const res = ok(await internal('POST', `/api/internal/share-links/${list}/disable`), 200, 'disable');
    expect(res.body).toEqual({ ok: true });
    fails(await call(null, 'GET', `/api/public?token=${token}`), 404, 'link_off', 'old link');

    fails(await internal('POST', '/api/internal/share-links/999999/disable'), 404, 'not_found', 'unknown list');
    fails(await internal('POST', '/api/internal/share-links/abc/disable'), 404, 'not_found', 'bad id');
  });
});
