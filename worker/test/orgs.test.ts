// Organisation wishlists: the team edits together, nobody on it sees reservations, outsiders get 404,
// and the portal gets totals per list through the internal route.
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import app from '../src/index';
import { call, fails, newItem, newTeamUser, newUser, ok, shareToken } from './helpers';

async function orgList(as: Parameters<typeof call>[0], orgId: string, title: string): Promise<number> {
  return ok(await call(as, 'POST', '/api/lists', { kind: 'wish', title, orgId }), 201, 'create org list').body.list.id;
}

describe('organisation wishlists', () => {
  it('belong to the team: everyone on it edits, nobody else sees them', async () => {
    const [matteo, noa] = [newTeamUser('Matteo Keller', ['org_a']), newTeamUser('Noa Brunner', ['org_a'])];
    const outsider = newUser('Sara Buehler');
    const other = newTeamUser('Lea Graf', ['org_b']);

    const overview = ok(await call(noa, 'GET', '/api/overview'), 200, 'overview').body;
    expect(overview.organisations).toEqual([{ id: 'org_a', name: 'Club org_a', maxLists: null, lists: [] }]);

    const id = await orgList(matteo, 'org_a', 'Vereinsfest');
    const list = ok(await call(noa, 'GET', `/api/lists?id=${id}`), 200, 'teammate opens').body.list;
    expect(list.org).toEqual({ id: 'org_a', name: 'Club org_a' });
    await newItem(noa, id, 'Beamer', 49900);
    ok(await call(noa, 'PATCH', `/api/lists?id=${id}`, { title: 'Sommerfest' }), 200, 'teammate renames');

    // Not a personal list of whoever started it.
    const mine = ok(await call(matteo, 'GET', '/api/overview'), 200, 'overview').body;
    expect(mine.lists).toEqual([]);
    expect(mine.organisations[0].lists.map((l: { title: string; itemCount: number }) => [l.title, l.itemCount])).toEqual([['Sommerfest', 1]]);
    expect(ok(await call(noa, 'GET', '/api/search?q=Beam'), 200, 'search').body.items).toHaveLength(1);

    for (const who of [outsider, other]) {
      fails(await call(who, 'GET', `/api/lists?id=${id}`), 404, 'not_found', 'outsider opens');
      fails(await call(who, 'POST', '/api/items', { listId: id, name: 'X' }), 404, 'not_found', 'outsider adds');
      expect(ok(await call(who, 'GET', '/api/search?q=Beam'), 200, 'outsider search').body.items).toHaveLength(0);
    }
    // Only for one's own organisations, and only for those that use Wishlist.
    fails(await call(outsider, 'POST', '/api/lists', { kind: 'wish', title: 'X', orgId: 'org_a' }), 404, 'not_found', 'outsider creates');
    const tourney = newTeamUser('Tim Roth', ['org_tournament']);
    fails(await call(tourney, 'POST', '/api/lists', { kind: 'wish', title: 'X', orgId: 'org_tournament' }), 404, 'not_found', 'no Wishlist');
    expect(ok(await call(tourney, 'GET', '/api/overview'), 200, 'overview').body.organisations).toEqual([]);
    fails(await call(matteo, 'POST', '/api/lists', { kind: 'person', title: 'Dad', orgId: 'org_a' }), 400, 'invalid', 'gift ideas');

    ok(await call(noa, 'DELETE', `/api/lists?id=${id}`), 204, 'teammate deletes');
  });

  it("keeps to the plan's number of lists", async () => {
    const u = newTeamUser('Noa Brunner', ['org_small']);
    await orgList(u, 'org_small', 'Erste');
    fails(await call(u, 'POST', '/api/lists', { kind: 'wish', title: 'Zweite', orgId: 'org_small' }), 409, 'limit', 'second list');
    // Personal lists don't count.
    ok(await call(u, 'POST', '/api/lists', { kind: 'wish', title: 'Meine' }), 201, 'personal list');
  });

  it('never shows anyone on the team a reservation', async () => {
    const [matteo, noa] = [newTeamUser('Matteo Keller', ['org_c']), newTeamUser('Noa Brunner', ['org_c'])];
    const lea = newUser('Lea Keller');
    const id = await orgList(matteo, 'org_c', 'Spenden');
    const ball = await newItem(matteo, id, 'Ball', 2900);
    await newItem(noa, id, 'Netz', 8900);
    const token = await shareToken(noa, id);

    const views = async () => {
      const out: Record<string, string> = {};
      for (const who of [matteo, noa]) {
        for (const target of [`/api/lists?id=${id}`, '/api/overview', `/api/public?token=${token}`, '/api/search?q=Ba']) {
          out[`${who.name} ${target}`] = ok(await call(who, 'GET', target), 200, `${who.name} GET ${target}`).raw;
        }
      }
      return out;
    };
    const before = await views();
    const pub = ok(await call(lea, 'GET', `/api/public?token=${token}`), 200, 'friend opens').body;
    expect(pub.list.owner.name).toBe('Club org_c');
    ok(await call(lea, 'POST', '/api/public/reserve', { token, itemId: ball }), 200, 'friend reserves');
    ok(await call(null, 'POST', '/api/public/reserve', { token, itemId: ball + 1, email: 'secret.guest@example.ch' }), 200, 'guest reserves');
    const after = await views();
    for (const [target, raw] of Object.entries(before)) expect(after[target], `${target} changed after friends reserved`).toBe(raw);
    for (const [target, raw] of Object.entries(after)) {
      expect(raw, `${target} has a reservation signal`).not.toMatch(new RegExp(`reserv|taken|"mine"|"free"|undo|secret\\.guest|${lea.id}|Lea Keller`, 'i'));
    }
    for (const who of [matteo, noa]) {
      fails(await call(who, 'POST', '/api/public/reserve', { token, itemId: ball }), 403, 'forbidden', `${who.name} reserves`);
      fails(await call(who, 'DELETE', '/api/public/reserve', { token, itemId: ball }), 403, 'forbidden', `${who.name} unreserves`);
    }
    // The friend sees it under "Shared with me" as the organisation's.
    const shared = ok(await call(lea, 'GET', '/api/overview'), 200, 'friend overview').body.shared;
    expect(shared.map((s: { title: string; owner: { name: string } }) => [s.title, s.owner.name])).toEqual([['Spenden', 'Club org_c']]);
  });

  it('gives the portal totals per list, never reservations, with the key only', async () => {
    const u = newTeamUser('Matteo Keller', ['org_d']);
    const friend = newUser('Lea Keller');
    const id = await orgList(u, 'org_d', 'Material');
    const item = await newItem(u, id, 'Trikots', 45000);
    await newItem(u, id, 'Bälle', 9000);
    const token = await shareToken(u, id);
    ok(await call(friend, 'POST', '/api/public/reserve', { token, itemId: item }), 200, 'friend reserves');

    fails(await call(null, 'GET', '/api/internal/orgs/org_d/lists'), 404, 'not_found', 'without the key');
    const res = await app.request('/api/internal/orgs/org_d/lists', { headers: { 'x-internal-key': 'test-internal-key' } }, env);
    expect(res.status).toBe(200);
    const raw = await res.text();
    const body = JSON.parse(raw);
    expect(body.lists).toEqual([{ id, title: 'Material', items: 2, value: 54000, shared: true, createdBy: 'Matteo Keller', updatedAt: expect.any(Number) }]);
    expect(raw).not.toMatch(/reserv|taken|Lea/i);
  });
});
