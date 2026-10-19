// Integration tests: the real routes on a local D1, with a fake planary-auth (vitest.config.ts).
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import app from '../src/index';
import { call, callRaw, fails, joinPersonList, newItem, newList, newUser, ok, shareToken } from './helpers';

describe('API', () => {
  it('requires sign-in', async () => {
    for (const target of ['/api/me', '/api/overview', '/api/lists?id=1', '/api/search?q=ab', '/api/invite?token=x']) {
      fails(await call(null, 'GET', target), 401, 'unauthorized', target);
    }
    fails(await call(null, 'POST', '/api/link-preview', { url: 'https://galaxus.ch' }), 401, 'unauthorized', 'link preview');
    fails(await call(null, 'GET', '/api/me'), 401, 'unauthorized', 'no token');
  });

  it('answers unknown paths and wrong methods in the same JSON shape', async () => {
    ok(await call(null, 'GET', '/api/health'), 200, 'health');
    for (const target of ['/api/health', '/api/me', '/api/nope']) {
      const res = await app.request(target, {}, env);
      expect(res.headers.get('Cache-Control'), target).toBe('no-store');
    }
    fails(await call(null, 'GET', '/api/nope'), 404, 'not_found', 'unknown path');
    const res = await call(null, 'PUT', '/api/overview');
    expect(res.status).toBe(405);
    expect(res.body).toEqual({ error: 'Method not allowed.', code: 'invalid' });
    const noa = newUser('Noa Brunner');
    fails(await call(noa, 'GET', '/api/lists?id=abc'), 400, 'invalid', 'bad id');
    fails(await callRaw(noa, 'POST', '/api/lists', '{not json'), 400, 'invalid', 'broken JSON');
  });

  it('describes the signed-in person', async () => {
    const noa = newUser('Noa Brunner');
    const res = ok(await call(noa, 'GET', '/api/me'), 200, 'me');
    expect(res.body.me).toMatchObject({ displayName: 'Noa Brunner', initials: 'NB', id: noa.id });
  });

  it('enforces the permission matrix', async () => {
    const [noa, lea, max] = [newUser('Noa Brunner'), newUser('Lea Keller'), newUser('Max Muster')];
    const wish = await newList(noa, 'wish', 'Ski season');
    const mom = await newList(noa, 'person', 'Mom');
    const wishItem = await newItem(noa, wish, 'Goggles', 12900);
    const noaIdea = await newItem(noa, mom, 'Scarf', 4900);

    // A stranger sees nothing and can't tell the lists exist.
    for (const [method, target] of [
      ['GET', `/api/lists?id=${wish}`], ['GET', `/api/lists?id=${mom}`],
      ['PATCH', `/api/lists?id=${mom}`], ['DELETE', `/api/lists?id=${wish}`],
      ['PATCH', `/api/items?id=${wishItem}`], ['DELETE', `/api/items?id=${noaIdea}`],
      ['POST', `/api/claims?itemId=${noaIdea}`], ['PUT', `/api/share?listId=${wish}`],
      ['POST', `/api/share/rotate?listId=${wish}`], ['POST', `/api/members/link?listId=${mom}`],
    ]) {
      fails(await call(max, method, target, { title: 'x', enabled: true }), 404, 'not_found', `stranger ${method} ${target}`);
    }
    fails(await call(max, 'POST', '/api/items', { listId: wish, name: 'x' }), 404, 'not_found', 'stranger adds item');
    fails(await call(max, 'POST', '/api/occasions', { listId: mom, label: 'Birthday', month: 5, day: 3 }), 404, 'not_found', 'stranger adds date');
    fails(await call(max, 'POST', '/api/members', { listId: mom, email: max.email }), 404, 'not_found', 'stranger invites');

    // Lea joins Mom's list as a co-planner.
    await joinPersonList(noa, lea, mom);
    let res = ok(await call(lea, 'GET', `/api/lists?id=${mom}`), 200, 'member reads list');
    expect([res.body.list.role, res.body.list.owner.name]).toEqual(['member', 'Noa Brunner']);

    // Co-planner: add ideas, edit and delete their own, not others'.
    const leaIdea = ok(await call(lea, 'POST', '/api/items', { listId: mom, name: 'Book', priority: 1 }), 201, 'member adds idea');
    expect(leaIdea.body.item.addedBy).toMatchObject({ name: 'Lea Keller', isMe: true });
    const leaIdeaId = leaIdea.body.item.id;
    ok(await call(lea, 'PATCH', `/api/items?id=${leaIdeaId}`, { name: 'Novel' }), 200, 'member edits own idea');
    fails(await call(lea, 'PATCH', `/api/items?id=${noaIdea}`, { name: 'x' }), 403, 'forbidden', "member edits owner's idea");
    fails(await call(lea, 'DELETE', `/api/items?id=${noaIdea}`), 403, 'forbidden', "member deletes owner's idea");

    // Co-planner: dates, budget ticks and claims yes; list settings and invites no.
    const occ = ok(await call(lea, 'POST', '/api/occasions', { listId: mom, label: 'Birthday', month: 11, day: 2, budgetCents: 15000 }), 201, 'member adds date').body.occasion.id;
    ok(await call(lea, 'PATCH', `/api/occasions?id=${occ}`, { budgetCents: null }), 200, 'member clears budget');
    ok(await call(lea, 'PUT', '/api/picks', { itemId: noaIdea, occasionId: occ, picked: true }), 200, 'member picks');
    ok(await call(lea, 'POST', `/api/claims?itemId=${noaIdea}`), 200, 'member claims');
    fails(await call(lea, 'PATCH', `/api/lists?id=${mom}`, { title: 'Mama' }), 403, 'forbidden', 'member renames');
    fails(await call(lea, 'DELETE', `/api/lists?id=${mom}`), 403, 'forbidden', 'member deletes list');
    fails(await call(lea, 'POST', '/api/members', { listId: mom, email: max.email }), 403, 'forbidden', 'member invites');
    fails(await call(lea, 'POST', `/api/members/link?listId=${mom}`), 403, 'forbidden', 'member makes invite link');

    // Wishlist-only and person-only actions on the wrong kind of list.
    fails(await call(noa, 'PUT', `/api/share?listId=${mom}`, { enabled: true }), 404, 'not_found', 'share a person list');
    fails(await call(noa, 'POST', `/api/claims?itemId=${wishItem}`), 404, 'not_found', 'claim on a wishlist');
    fails(await call(noa, 'PUT', '/api/picks', { itemId: wishItem, occasionId: occ, picked: true }), 404, 'not_found', 'pick on a wishlist');
    fails(await call(noa, 'POST', '/api/members', { listId: wish, email: lea.email }), 400, 'invalid', 'invite to a wishlist');
    fails(await call(noa, 'PATCH', `/api/lists?id=${wish}`, { personNotes: ['x'] }), 400, 'invalid', 'notes on a wishlist');

    // Owner: everything on their lists, including others' ideas.
    ok(await call(noa, 'PATCH', `/api/lists?id=${mom}`, { title: 'Mama', personFullName: 'Andrea Brunner', personNotes: ['Size M', ' ', 'Likes green'] }), 200, 'owner edits list');
    res = ok(await call(noa, 'GET', `/api/lists?id=${mom}`), 200, 'owner reads list');
    expect(res.body.list.title).toBe('Mama');
    expect(res.body.list.personNotes).toEqual(['Size M', 'Likes green']);
    expect(res.body.list.members[0].status).toBe('active');
    ok(await call(noa, 'DELETE', `/api/items?id=${leaIdeaId}`), 204, "owner deletes member's idea");

    // Lea leaves; the list is gone for her.
    ok(await call(lea, 'DELETE', `/api/members?id=${res.body.list.members[0].id}`), 204, 'member leaves');
    fails(await call(lea, 'GET', `/api/lists?id=${mom}`), 404, 'not_found', 'former member reads list');

    // Deleting a list takes everything with it.
    ok(await call(noa, 'DELETE', `/api/lists?id=${wish}`), 204, 'owner deletes wishlist');
    fails(await call(noa, 'GET', `/api/lists?id=${wish}`), 404, 'not_found', 'deleted list');
  });

  it('validates input', async () => {
    const noa = newUser('Noa Brunner');
    fails(await call(noa, 'POST', '/api/lists', { kind: 'wish', title: '   ' }), 400, 'invalid', 'blank title');
    fails(await call(noa, 'POST', '/api/lists', { kind: 'other', title: 'x' }), 400, 'invalid', 'bad kind');
    fails(await call(noa, 'POST', '/api/lists', { kind: 'wish', title: 'a'.repeat(61) }), 400, 'invalid', 'long title');
    fails(await call(noa, 'POST', '/api/lists', { kind: 'wish', title: 5 }), 400, 'invalid', 'title of the wrong type');
    const wish = await newList(noa, 'wish', '  Ski   season ');
    const res = ok(await call(noa, 'GET', `/api/lists?id=${wish}`), 200, 'read');
    expect(res.body.list.title).toBe('Ski season');
    expect(res.body.list.occasion).toBeNull();
    expect(res.body.list.share.url).toBeNull();

    for (const body of [
      { listId: wish, name: ' ' },
      { listId: wish, name: 'x', priceCents: -1 },
      { listId: wish, name: 'x', priority: 4 },
      { listId: wish, name: 'x', currency: 'chf1' },
      { listId: wish, name: 'x', url: 'javascript:alert(1)' },
      { listId: wish, name: 'x', imageUrl: 'data:image/png;base64,AAAA' },
    ]) {
      fails(await call(noa, 'POST', '/api/items', body), 400, 'invalid', JSON.stringify(body));
    }

    // The store comes from the URL; creating an item never fetches it.
    const item = ok(await call(noa, 'POST', '/api/items', { listId: wish, name: 'Goggles', url: 'https://WWW.Galaxus.ch:443/p/1', currency: 'eur' }), 201, 'item');
    expect(item.body.item).toMatchObject({ store: 'galaxus.ch', currency: 'EUR', priority: 2 });

    for (const body of [
      { listId: wish, label: 'Birthday', month: 4, day: 31 },
      { listId: wish, label: 'Birthday', month: 13, day: 1 },
      { listId: wish, label: 'Birthday', month: 2, day: 29, year: 2027 },
      { listId: wish, label: '', month: 1, day: 1 },
    ]) {
      fails(await call(noa, 'POST', '/api/occasions', body), 400, 'invalid', JSON.stringify(body));
    }
    fails(await call(noa, 'GET', '/api/search?q=a'), 400, 'invalid', 'short search');
  });

  it('allows one date per wishlist and many per person', async () => {
    const noa = newUser('Noa Brunner');
    const wish = await newList(noa, 'wish', 'Birthday list');
    ok(await call(noa, 'POST', '/api/occasions', { listId: wish, label: 'Birthday', month: 2, day: 29 }), 201, 'first date');
    fails(await call(noa, 'POST', '/api/occasions', { listId: wish, label: 'Christmas', month: 12, day: 24 }), 409, 'one_occasion', 'second date');

    const mom = await newList(noa, 'person', 'Mom');
    ok(await call(noa, 'POST', '/api/occasions', { listId: mom, label: 'Birthday', month: 5, day: 3, budgetCents: 15000 }), 201, 'person date 1');
    ok(await call(noa, 'POST', '/api/occasions', { listId: mom, label: 'Christmas', month: 12, day: 24, year: 2099 }), 201, 'person date 2');
    const res = ok(await call(noa, 'GET', `/api/lists?id=${mom}`), 200, 'read');
    expect(res.body.list.occasions).toHaveLength(2);
  });

  it('lets one co-planner claim an idea at a time', async () => {
    const [noa, lea, max] = [newUser('Noa Brunner'), newUser('Lea Keller'), newUser('Max Muster')];
    const mom = await newList(noa, 'person', 'Mom');
    await joinPersonList(noa, lea, mom);
    await joinPersonList(noa, max, mom);
    const idea = await newItem(noa, mom, 'Scarf', 4900);

    let res = ok(await call(lea, 'POST', `/api/claims?itemId=${idea}`), 200, 'Lea claims');
    expect(res.body.item.reservedBy).toMatchObject({ name: 'Lea Keller', isMe: true });
    ok(await call(lea, 'POST', `/api/claims?itemId=${idea}`), 200, 'Lea claims again (idempotent)');
    fails(await call(max, 'POST', `/api/claims?itemId=${idea}`), 409, 'taken', 'Max claims a taken idea');
    fails(await call(noa, 'POST', `/api/claims?itemId=${idea}`), 409, 'taken', 'owner claims a taken idea');

    res = ok(await call(noa, 'GET', `/api/lists?id=${mom}`), 200, 'owner sees the claim');
    expect(res.body.list.items[0].reservedBy.name).toBe('Lea Keller');
    fails(await call(max, 'DELETE', `/api/claims?itemId=${idea}`), 403, 'forbidden', "Max undoes Lea's claim");
    res = ok(await call(noa, 'DELETE', `/api/claims?itemId=${idea}`), 200, "owner clears Lea's claim");
    expect(res.body.item.reservedBy).toBeNull();
    ok(await call(max, 'POST', `/api/claims?itemId=${idea}`), 200, 'Max claims');
    ok(await call(max, 'DELETE', `/api/claims?itemId=${idea}`), 200, 'Max undoes own claim');
  });

  it('rotates share links and turns them off', async () => {
    const [noa, lea] = [newUser('Noa Brunner'), newUser('Lea Keller')];
    const wish = await newList(noa, 'wish', 'Ski season');
    await newItem(noa, wish, 'Goggles', 12900);

    const first = await shareToken(noa, wish);
    expect(first).toMatch(/^[A-Za-z0-9_-]{22}$/);
    let res = ok(await call(null, 'GET', `/api/public?token=${first}`), 200, 'guest opens link');
    expect([res.body.list.owner.name, res.body.list.items[0].status, res.body.viewer.signedIn]).toEqual(['Noa Brunner', 'free', false]);

    const rot = ok(await call(noa, 'POST', `/api/share/rotate?listId=${wish}`), 200, 'rotate');
    const second = (rot.body.share.url as string).replace('https://wishlist.test/w/', '');
    expect(second).not.toBe(first);
    expect(second).not.toBe('');
    fails(await call(lea, 'GET', `/api/public?token=${first}`), 404, 'link_off', 'old link after rotate');
    ok(await call(lea, 'GET', `/api/public?token=${second}`), 200, 'new link');

    ok(await call(noa, 'PUT', `/api/share?listId=${wish}`, { enabled: false }), 200, 'turn off');
    fails(await call(lea, 'GET', `/api/public?token=${second}`), 404, 'link_off', 'link while off');
    expect(await shareToken(noa, wish)).toBe(second); // turning sharing back on keeps the link
    fails(await call(null, 'GET', '/api/public?token=nope'), 404, 'link_off', 'unknown token');
    res = await call(null, 'GET', '/api/public?token=');
    fails(res, 404, 'link_off', 'empty token');
  });

  it('takes reservations from friends and guests', async () => {
    const [noa, lea, max] = [newUser('Noa Brunner'), newUser('Lea Keller'), newUser('Max Muster')];
    const wish = await newList(noa, 'wish', 'Ski season');
    const goggles = await newItem(noa, wish, 'Goggles', 12900);
    const gloves = await newItem(noa, wish, 'Gloves', 5900);
    const token = await shareToken(noa, wish);

    // Signed-in visitor reserves with their account.
    let res = ok(await call(lea, 'POST', '/api/public/reserve', { token, itemId: goggles }), 200, 'Lea reserves');
    expect([res.body.item.status, res.body.undoToken]).toEqual(['mine', null]);
    // Guest reserves with an email and gets an undo token.
    fails(await call(null, 'POST', '/api/public/reserve', { token, itemId: gloves }), 400, 'invalid', 'guest without email');
    res = ok(await call(null, 'POST', '/api/public/reserve', { token, itemId: gloves, email: 'guest@example.ch' }), 200, 'guest reserves');
    const undo: string = res.body.undoToken;
    expect(undo).toMatch(/^[A-Za-z0-9_-]{43}$/);
    fails(await call(max, 'POST', '/api/public/reserve', { token, itemId: goggles }), 409, 'taken', 'Max reserves a taken item');

    // What each visitor sees.
    res = ok(await call(lea, 'GET', `/api/public?token=${token}`), 200, "Lea's view");
    const statuses = Object.fromEntries(res.body.list.items.map((i: { name: string; status: string }) => [i.name, i.status]));
    expect(statuses).toEqual({ Goggles: 'mine', Gloves: 'taken' });
    res = ok(await call(null, 'GET', `/api/public?token=${token}`), 200, 'guest view');
    expect(res.raw.match(/"status":"taken"/g)).toHaveLength(2);

    // Lea's overview lists it under "Shared with me".
    res = ok(await call(lea, 'GET', '/api/overview'), 200, "Lea's overview");
    expect(res.body.shared[0]).toMatchObject({ token, takenCount: 2, mineCount: 1, itemCount: 2 });

    // Undo: guest with the token, Lea with her account. Nobody undoes someone else's.
    fails(await call(null, 'DELETE', '/api/public/reserve', { token, itemId: gloves, undoToken: 'wrong' }), 404, 'not_found', 'wrong undo token');
    fails(await call(max, 'DELETE', '/api/public/reserve', { token, itemId: goggles }), 404, 'not_found', "Max undoes Lea's");
    res = ok(await call(null, 'DELETE', '/api/public/reserve', { token, itemId: gloves, undoToken: undo }), 200, 'guest undo');
    expect(res.body.item.status).toBe('free');
    ok(await call(lea, 'DELETE', '/api/public/reserve', { token, itemId: goggles }), 200, 'Lea undo');

    // Turning sharing off hides it from "Shared with me".
    ok(await call(noa, 'PUT', `/api/share?listId=${wish}`, { enabled: false }), 200, 'off');
    res = ok(await call(lea, 'GET', '/api/overview'), 200, "Lea's overview");
    expect(res.body.shared).toHaveLength(0);
  });

  it('runs personal invites and the reusable link', async () => {
    const [noa, lea, max] = [newUser('Noa Brunner'), newUser('Lea Keller'), newUser('Max Muster')];
    const mom = await newList(noa, 'person', 'Mom');

    const inv = ok(await call(noa, 'POST', '/api/members', { listId: mom, email: lea.email.toUpperCase() }), 201, 'invite');
    expect(inv.body).toMatchObject({ emailSent: false, member: { status: 'invited', email: lea.email } });
    expect(inv.body.inviteUrl).toMatch(/^https:\/\/wishlist\.test\/invite\//);
    const token = (inv.body.inviteUrl as string).replace('https://wishlist.test/invite/', '');
    fails(await call(noa, 'POST', '/api/members', { listId: mom, email: noa.email }), 400, 'invalid', 'invite yourself');
    fails(await call(noa, 'POST', '/api/members', { listId: mom, email: 'not-an-email' }), 400, 'invalid', 'bad email');

    let prev = ok(await call(max, 'GET', `/api/invite?token=${token}`), 200, 'preview');
    expect(prev.body).toMatchObject({ listTitle: 'Mom', invitedBy: { name: 'Noa Brunner' }, alreadyMember: false });
    fails(await call(max, 'POST', '/api/invite/accept', { token }), 403, 'forbidden', 'wrong person accepts a personal invite');
    fails(await call(noa, 'POST', '/api/invite/accept', { token }), 400, 'invalid', 'owner accepts');
    const res = ok(await call(lea, 'POST', '/api/invite/accept', { token }), 200, 'Lea accepts');
    expect(res.body.listId).toBe(mom);
    fails(await call(lea, 'POST', '/api/invite/accept', { token }), 404, 'not_found', 'personal invites work once');
    fails(await call(noa, 'POST', '/api/members', { listId: mom, email: lea.email }), 400, 'invalid', 'invite an active member');

    // The reusable link: anyone signed in. Making a new one retires the old one.
    const link: string = ok(await call(noa, 'POST', `/api/members/link?listId=${mom}`), 200, 'link').body.inviteUrl;
    const newer: string = ok(await call(noa, 'POST', `/api/members/link?listId=${mom}`), 200, 'new link').body.inviteUrl;
    const tokenOf = (u: string) => u.replace('https://wishlist.test/invite/', '');
    fails(await call(max, 'GET', `/api/invite?token=${tokenOf(link)}`), 404, 'not_found', 'old reusable link');
    ok(await call(max, 'POST', '/api/invite/accept', { token: tokenOf(newer) }), 200, 'Max accepts the link');
    prev = ok(await call(max, 'GET', `/api/invite?token=${tokenOf(newer)}`), 200, 'preview again');
    expect(prev.body.alreadyMember).toBe(true);

    // Lea's overview shows the list as a member, with Noa and Max as co-planners.
    const ov = ok(await call(lea, 'GET', '/api/overview'), 200, "Lea's overview");
    expect(ov.body.people[0].role).toBe('member');
    expect(ov.body.people[0].coPlanners.map((p: { name: string }) => p.name)).toEqual(['Noa Brunner', 'Max Muster']);
  });

  it('builds the overview and searches', async () => {
    const noa = newUser('Noa Brunner');
    const wish = await newList(noa, 'wish', 'Ski season');
    for (const name of ['Goggles', 'Gloves', 'Helmet', 'Socks', 'Wax']) await newItem(noa, wish, name, 1000);
    const mom = await newList(noa, 'person', 'Mom');
    const occ = ok(await call(noa, 'POST', '/api/occasions', { listId: mom, label: 'Birthday', month: 5, day: 3, budgetCents: 15000 }), 201, 'date').body.occasion.id;
    const scarf = await newItem(noa, mom, 'Scarf', 4900);
    const tea = await newItem(noa, mom, 'Tea set', 2990);
    ok(await call(noa, 'POST', '/api/items', { listId: mom, name: 'Bag', priceCents: 9000, currency: 'EUR' }), 201, 'EUR idea');
    for (const itemId of [scarf, tea]) ok(await call(noa, 'PUT', '/api/picks', { itemId, occasionId: occ, picked: true }), 200, 'pick');

    ok(await call(noa, 'POST', '/api/members', { listId: mom, email: 'jonas.brunner@example.ch' }), 201, 'invite');

    let res = ok(await call(noa, 'GET', '/api/overview'), 200, 'overview');
    // A pending invite shows in the co-planner stack, named by its email until they join.
    expect(res.body.people[0].coPlanners[0]).toMatchObject({ name: 'jonas.brunner', initials: 'JB' });
    expect(res.body.lists[0]).toMatchObject({ itemCount: 5, shared: false });
    expect(res.body.lists[0].previews).toHaveLength(4);
    expect(res.body.people[0]).toMatchObject({
      pickedCentsByOccasion: { [occ]: 7890 },
      pickedCountByOccasion: { [occ]: 2 },
      ideaCount: 3,
      role: 'owner',
    });

    res = ok(await call(noa, 'GET', '/api/search?q=GLO'), 200, 'search');
    expect(res.body.items[0]).toMatchObject({ name: 'Gloves', listTitle: 'Ski season' });
    res = ok(await call(noa, 'GET', '/api/search?q=mo'), 200, 'search lists');
    expect(res.body.lists[0]).toMatchObject({ title: 'Mom', kind: 'person' });
    res = ok(await call(noa, 'GET', '/api/search?q=%25%25'), 200, 'search for %%');
    expect(res.body.items.length + res.body.lists.length).toBe(0);
    res = ok(await call(newUser('Max Muster'), 'GET', '/api/search?q=Gloves'), 200, 'someone else searches');
    expect(res.body.items).toHaveLength(0);
  });

  // The privacy rule: nothing the owner of a wishlist can call says anything about its reservations.
  // Every owner response is captured before and after friends reserve, and must be byte-for-byte the
  // same and free of reservation signals.
  it('never shows a wishlist owner its reservations', async () => {
    const [noa, lea] = [newUser('Noa Brunner'), newUser('Lea Keller')];
    const wish = await newList(noa, 'wish', 'Ski season');
    ok(await call(noa, 'POST', '/api/occasions', { listId: wish, label: 'Birthday', month: 11, day: 2 }), 201, 'date');
    const goggles = await newItem(noa, wish, 'Goggles', 12900);
    const gloves = await newItem(noa, wish, 'Gloves', 5900);
    await newItem(noa, wish, 'Helmet', 19900);
    const token = await shareToken(noa, wish);

    const ownerViews = async () => {
      const out: Record<string, string> = {};
      for (const target of [`/api/lists?id=${wish}`, '/api/overview', `/api/public?token=${token}`, '/api/search?q=Go', '/api/me']) {
        out[target] = ok(await call(noa, 'GET', target), 200, `owner GET ${target}`).raw;
      }
      return out;
    };
    const before = await ownerViews();

    ok(await call(lea, 'POST', '/api/public/reserve', { token, itemId: goggles }), 200, 'Lea reserves');
    ok(await call(null, 'POST', '/api/public/reserve', { token, itemId: gloves, email: 'secret.guest@example.ch' }), 200, 'guest reserves');

    const after = await ownerViews();
    // Writes the owner makes return the item or list too.
    after['PATCH item'] = ok(await call(noa, 'PATCH', `/api/items?id=${goggles}`, { note: 'Size L' }), 200, 'owner edits a reserved item').raw;
    after['POST item'] = ok(await call(noa, 'POST', '/api/items', { listId: wish, name: 'Poles' }), 201, 'owner adds').raw;
    after['PATCH list'] = ok(await call(noa, 'PATCH', `/api/lists?id=${wish}`, { title: 'Ski season' }), 200, 'owner renames').raw;
    after['PUT share'] = ok(await call(noa, 'PUT', `/api/share?listId=${wish}`, { enabled: true }), 200, 'owner shares').raw;
    // The owner can't use the visitor actions to probe: same answer for reserved and free items.
    for (const itemId of [goggles, gloves]) {
      fails(await call(noa, 'POST', '/api/public/reserve', { token, itemId }), 403, 'forbidden', 'owner reserves');
      fails(await call(noa, 'DELETE', '/api/public/reserve', { token, itemId }), 403, 'forbidden', 'owner unreserves');
      fails(await call(noa, 'POST', `/api/claims?itemId=${itemId}`), 404, 'not_found', 'owner claims');
      fails(await call(noa, 'DELETE', `/api/claims?itemId=${itemId}`), 404, 'not_found', 'owner unclaims');
    }

    for (const [target, raw] of Object.entries(before)) {
      expect(after[target], `owner's ${target} changed after friends reserved`).toBe(raw);
    }
    const signals = new RegExp(`reserv|taken|"mine"|"free"|undo|secret\\.guest|${lea.id}|Lea Keller`, 'i');
    for (const [target, raw] of Object.entries(after)) {
      expect(raw, `owner's ${target} has a reservation signal`).not.toMatch(signals);
      const statuses = raw.match(/"status"/g)?.length ?? 0;
      const hidden = raw.match(/"status":"hidden"/g)?.length ?? 0;
      expect(hidden, `owner's ${target} has a status other than hidden`).toBe(statuses);
    }
  });
});
