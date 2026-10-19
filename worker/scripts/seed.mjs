// Fills the database with the prototype's demo data (docs/wishlist-v2/prototype: LISTS, PEOPLE,
// SHARED) for one Planary user, so the app can be compared with the screenshots.
//
//   npm run seed -- --user <id> [--email noa@example.ch] [--name "Noa Brunner"] [--reset] [--remote]
//
// Local D1 by default (what `npm run dev` uses); --remote seeds the deployed database. Three demo
// friends (Matteo, Lea, Jonas) get fixed ids; they can't sign in, they only own the "Shared with me"
// lists and appear as co-planners. --reset deletes the user's lists and the demo friends' lists the
// user follows before seeding again.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    user: { type: 'string' },
    email: { type: 'string', default: 'noa@example.ch' },
    name: { type: 'string', default: 'Noa Brunner' },
    reset: { type: 'boolean', default: false },
    remote: { type: 'boolean', default: false },
  },
});
if (!args.user?.trim()) {
  console.error('usage: npm run seed -- --user <id> [--email …] [--name …] [--reset] [--remote]');
  process.exit(2);
}

const matteo = { id: '00000000-0000-4000-8000-00000000de01', email: 'matteo.keller@example.ch', name: 'Matteo Keller' };
const lea = { id: '00000000-0000-4000-8000-00000000de02', email: 'lea.brunner@example.ch', name: 'Lea Brunner' };
const jonas = { id: '00000000-0000-4000-8000-00000000de03', email: 'jonas.brunner@example.ch', name: 'Jonas Brunner' };
const demoFriends = [matteo, lea, jonas];
const me = { id: args.user.trim().toLowerCase(), email: args.email, name: args.name };

// Wishlist items: [name, store, cents, priority (1 must have … 3 nice to have), note, reservedBy ('guest' | 'me' | '')]
const wishlists = [
  { title: 'Birthday', shared: true, occasion: ['Birthday', 5, 24, 0], items: [
    ['Over-ear noise-cancelling headphones', 'digitec.ch', 34900, 1, 'Black, not silver', ''],
    ['Instant film camera', 'galaxus.ch', 12900, 1, '', 'guest'],
    ['Field watch, 38 mm', 'galaxus.ch', 24500, 2, 'Green dial if they still have it', ''],
    ['Trail running shoes', 'zalando.ch', 15995, 2, 'Size 42', ''],
    ['Leather card holder', 'manor.ch', 5990, 2, 'Dark brown', ''],
    ['Wireless game controller', 'interdiscount.ch', 6995, 3, '', ''],
    ['Ceramic pour-over set', 'galaxus.ch', 6400, 3, 'White or sand', 'guest'],
    ['Desk lamp with dimmer', 'ikea.ch', 4995, 3, '', ''],
    ['Klara and the Sun, paperback', 'orellfuessli.ch', 1990, 3, '', ''],
  ] },
  { title: 'New flat', shared: false, occasion: null, items: [
    ['Two-seat sofa, light grey', 'ikea.ch', 69900, 1, 'Max. 180 cm wide', ''],
    ['Olive tree, 120 cm', 'galaxus.ch', 8900, 2, '', ''],
    ['Floor lamp, linen shade', 'manor.ch', 14900, 2, '', ''],
    ['Cast-iron pan, 28 cm', 'galaxus.ch', 7900, 2, '', ''],
    ['Espresso cups, set of 4', 'galaxus.ch', 3490, 3, '', ''],
    ['Bookshelf, oak', 'ikea.ch', 12900, 3, '', ''],
  ] },
  { title: 'Someday', shared: false, occasion: null, items: [
    ['Chronograph, panda dial', 'chrono24.ch', 145000, 3, 'Saving up for this one', ''],
    ['Full-frame mirrorless camera', 'digitec.ch', 219900, 3, '', ''],
    ['Weekend bag, waxed canvas', 'zalando.ch', 18900, 3, '', ''],
    ['Handheld game console', 'interdiscount.ch', 34900, 3, '', ''],
  ] },
  { title: 'Christmas', shared: false, occasion: ['Christmas', 12, 25, 0], items: [] },
];

// Person lists. Ideas: [name, store, cents, addedBy (null = the user), picked (first occasion), claimedBy (null, me or a friend)]
// Planners: the first has joined, the rest are invited.
const people = [
  { title: 'Mom', fullName: 'Andrea Brunner',
    notes: ['Tops in M, shoes in 38', 'Loves olive green and linen, not purple', 'Already has a Nespresso machine and an e-reader'],
    occasions: [['Birthday', 11, 2, 15000], ['Christmas', 12, 25, 10000]],
    ideas: [
      ['Linen scarf, olive', 'manor.ch', 5900, lea, true, lea],
      ['Herb garden starter kit', 'galaxus.ch', 3700, null, true, me],
      ['Pottery evening for two', 'mydays.ch', 8900, lea, false, null],
      ['Vegetable cookbook', 'orellfuessli.ch', 3490, null, false, null],
      ['Reading lamp, brass', 'ikea.ch', 3995, jonas, false, null],
      ['Silk pillowcase', 'manor.ch', 4900, null, false, null],
    ],
    planners: [lea, jonas] },
  { title: 'Lea', fullName: 'Lea Brunner', notes: [], occasions: [['Christmas', 12, 25, 8000]],
    ideas: [
      ['Chalk bag', 'bergzeit.ch', 2990, null, true, null],
      ['Film rolls, pack of 5', 'galaxus.ch', 5400, null, false, null],
      ['Climbing gym, 10-entry card', '', 15000, null, false, null],
    ],
    planners: [] },
  { title: 'Jonas', fullName: 'Jonas Brunner', notes: [], occasions: [['Christmas', 12, 25, 6000]],
    ideas: [
      ['Board game for 2–4 players', 'galaxus.ch', 4900, null, false, null],
      ['Wool beanie', 'zalando.ch', 2995, null, false, null],
    ],
    planners: [] },
  { title: 'Grandpa Ruedi', fullName: 'Ruedi Brunner', notes: [], occasions: [['Birthday', 1, 19, 5000]],
    ideas: [['Garden kneeler with handles', 'jumbo.ch', 3490, null, false, null]],
    planners: [] },
];

// Lists friends shared with the user ("Shared with me"). The user follows both.
const shared = [
  { owner: matteo, list: { title: 'Matteo turns 30', shared: true, occasion: ['Matteo turns 30', 11, 14, 0], items: [
    ['Record player', 'digitec.ch', 29900, 1, '', ''],
    ['Espresso grinder', 'galaxus.ch', 18900, 1, '', 'guest'],
    ['Hiking backpack, 30 l', 'bergzeit.ch', 13900, 2, 'Dark colours please', 'me'],
    ['Cast-iron pan, 26 cm', 'galaxus.ch', 6900, 2, '', 'guest'],
    ['Board game for 2–4 players', 'galaxus.ch', 4900, 3, '', ''],
    ['Wool beanie, navy', 'zalando.ch', 2995, 3, '', ''],
  ] } },
  { owner: lea, list: { title: 'Lea’s wishlist', shared: true, occasion: null, items: [
    ['Climbing shoes', 'bergzeit.ch', 16900, 1, '', ''],
    ['Film camera, 35 mm', 'galaxus.ch', 11900, 2, '', ''],
    ['Linen bedding set', 'manor.ch', 12900, 3, '', ''],
    ['Canvas tote bag', 'zalando.ch', 3900, 3, '', ''],
  ] } },
];

// ── SQL ──
// A file of plain statements, so it runs the same locally and remotely. New rows are found again by
// owner and title (lists) or list and name (items, occasions), which are unique within the demo data.

const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replaceAll("'", "''")}'`);
const minutesAgo = (n) => `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${n} minutes')`;
const listRef = (ownerId, kind, title) => `(SELECT id FROM lists WHERE owner_id = ${q(ownerId)} AND kind = '${kind}' AND title = ${q(title)})`;
const itemRef = (list, name) => `(SELECT id FROM items WHERE list_id = ${list} AND name = ${q(name)})`;
const occasionRef = (list, label) => `(SELECT id FROM occasions WHERE list_id = ${list} AND label = ${q(label)})`;
const sql = [];

if (args.reset) {
  sql.push(`DELETE FROM lists WHERE owner_id = ${q(me.id)}
  OR (owner_id IN (${demoFriends.map((f) => q(f.id)).join(', ')}) AND id IN (SELECT list_id FROM list_followers WHERE user_id = ${q(me.id)}));`);
}

// Profiles: the user keeps theirs if they have one; the demo friends are always refreshed.
sql.push(`INSERT INTO profiles (user_id, email, display_name) VALUES (${q(me.id)}, ${q(me.email)}, ${q(me.name)}) ON CONFLICT (user_id) DO NOTHING;`);
for (const f of demoFriends) {
  sql.push(`INSERT INTO profiles (user_id, email, display_name) VALUES (${q(f.id)}, ${q(f.email)}, ${q(f.name)})
  ON CONFLICT (user_id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name;`);
}

function addOccasion(list, [label, month, day, budget]) {
  sql.push(`INSERT INTO occasions (list_id, label, month, day, budget_cents) VALUES (${list}, ${q(label)}, ${month}, ${day}, ${budget > 0 ? budget : 'NULL'});`);
}

// i keeps the prototype's order: newest first, so the first item is the newest.
function addItem(list, i, name, store, cents, priority, note, addedBy) {
  sql.push(`INSERT INTO items (list_id, name, url, store, price_cents, priority, note, added_by, created_at)
  VALUES (${list}, ${q(name)}, ${q(store ? `https://www.${store}/` : '')}, ${q(store)}, ${cents}, ${priority}, ${q(note)}, ${q(addedBy)}, ${minutesAgo(i)});`);
}

// Reservations marked 'me' are made by the user, 'guest' by an email.
function addWishlist(ownerId, pos, w) {
  const token = w.shared ? randomBytes(16).toString('base64url') : null;
  sql.push(`INSERT INTO lists (owner_id, kind, title, position, share_enabled, share_token) VALUES (${q(ownerId)}, 'wish', ${q(w.title)}, ${pos}, ${w.shared ? 1 : 0}, ${q(token)});`);
  const list = listRef(ownerId, 'wish', w.title);
  if (w.occasion) addOccasion(list, w.occasion);
  w.items.forEach(([name, store, cents, priority, note, reservedBy], i) => {
    addItem(list, i, name, store, cents, priority, note, ownerId);
    const item = itemRef(list, name);
    if (reservedBy === 'guest') sql.push(`INSERT INTO reservations (item_id, source, email) SELECT id, 'web', 'guest' || id || '@example.ch' FROM items WHERE id = ${item};`);
    if (reservedBy === 'me') sql.push(`INSERT INTO reservations (item_id, source, user_id) VALUES (${item}, 'web', ${q(me.id)});`);
  });
  return list;
}

wishlists.forEach((w, pos) => addWishlist(me.id, pos, w));

people.forEach((p, pos) => {
  sql.push(`INSERT INTO lists (owner_id, kind, title, person_full_name, person_notes, position)
  VALUES (${q(me.id)}, 'person', ${q(p.title)}, ${q(p.fullName)}, ${q(p.notes.join('\n'))}, ${pos});`);
  const list = listRef(me.id, 'person', p.title);
  p.occasions.forEach((o) => addOccasion(list, o));
  p.planners.forEach((pl, i) => {
    sql.push(i === 0
      ? `INSERT INTO list_members (list_id, email, user_id, status, invited_by, joined_at) VALUES (${list}, ${q(pl.email)}, ${q(pl.id)}, 'active', ${q(me.id)}, ${minutesAgo(0)});`
      : `INSERT INTO list_members (list_id, email, status, invited_by) VALUES (${list}, ${q(pl.email)}, 'invited', ${q(me.id)});`);
  });
  p.ideas.forEach(([name, store, cents, addedBy, picked, claimedBy], i) => {
    addItem(list, i, name, store, cents, 2, '', (addedBy ?? me).id);
    const item = itemRef(list, name);
    if (picked) sql.push(`INSERT INTO item_picks (item_id, occasion_id) VALUES (${item}, ${occasionRef(list, p.occasions[0][0])});`);
    if (claimedBy) sql.push(`INSERT INTO reservations (item_id, source, user_id) VALUES (${item}, 'member', ${q(claimedBy.id)});`);
  });
});

// Followed newest first, in the prototype's order.
shared.forEach((s, i) => {
  const list = addWishlist(s.owner.id, 0, s.list);
  sql.push(`INSERT INTO list_followers (list_id, user_id, created_at) VALUES (${list}, ${q(me.id)}, ${minutesAgo(i)});`);
});

// ── Run ──

const where = args.remote ? '--remote' : '--local';
const wrangler = (...rest) => execFileSync('npx', ['wrangler', 'd1', 'execute', 'planary-wishlist', where, ...rest], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

if (!args.reset) {
  const out = JSON.parse(wrangler('--json', '--command', `SELECT COUNT(*) AS n FROM lists WHERE owner_id = ${q(me.id)}`));
  if (out[0].results[0].n > 0) {
    console.error('This user already has lists; pass --reset to replace them with the demo data.');
    process.exit(1);
  }
}
const dir = mkdtempSync(join(tmpdir(), 'wishlist-seed-'));
try {
  const file = join(dir, 'seed.sql');
  writeFileSync(file, sql.join('\n') + '\n');
  wrangler('--file', file, '--yes');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`Seeded the demo data for ${me.id} (${args.remote ? 'remote' : 'local'} database).`);
