import { env } from 'cloudflare:workers';
import { expect } from 'vitest';
import app from '../src/index';

export interface TestUser {
  id: string;
  email: string;
  name: string;
}

export function newUser(name: string): TestUser {
  const id = crypto.randomUUID();
  return { id, email: `${name.split(' ')[0].toLowerCase()}.${id.slice(0, 8)}@example.ch`, name };
}

/** A user on the teams of these organisations (see the ORG stand-in in vitest.config.ts). */
export function newTeamUser(name: string, orgs: string[]): TestUser {
  const u = newUser(name);
  return { ...u, id: `team.${orgs.join('.')}.${u.id}` };
}

export interface Res {
  status: number;
  raw: string;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Runs one request through the real app. as is null for a guest. */
export function call(as: TestUser | null, method: string, target: string, body?: unknown): Promise<Res> {
  return callRaw(as, method, target, body === undefined ? undefined : JSON.stringify(body));
}

/** The same with the body sent as is, to test what broken JSON gets. */
export async function callRaw(as: TestUser | null, method: string, target: string, body?: string): Promise<Res> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'CF-Connecting-IP': `203.0.113.${Math.floor(Math.random() * 250) + 1}`,
  };
  if (as) headers.Authorization = `Bearer test|${as.id}|${as.email}|${as.name}`;
  const res = await app.request(target, { method, headers, body: method === 'GET' || method === 'HEAD' ? undefined : body }, env);
  const raw = await res.text();
  return { status: res.status, raw, body: raw ? JSON.parse(raw) : null };
}

export function ok(res: Res, status: number, what: string): Res {
  expect(res.status, `${what}: ${res.raw}`).toBe(status);
  return res;
}

export function fails(res: Res, status: number, code: string, what: string) {
  expect([res.status, res.body?.code], `${what}: ${res.raw}`).toEqual([status, code]);
}

// ── Scenario helpers ──

export async function newList(as: TestUser, kind: 'wish' | 'person', title: string): Promise<number> {
  return ok(await call(as, 'POST', '/api/lists', { kind, title }), 201, 'create list').body.list.id;
}

export async function newItem(as: TestUser, listId: number, name: string, priceCents: number): Promise<number> {
  const res = await call(as, 'POST', '/api/items', { listId, name, priceCents, url: `https://www.galaxus.ch/p/${name}` });
  return ok(res, 201, `create item ${name}`).body.item.id;
}

export async function shareToken(as: TestUser, listId: number): Promise<string> {
  const url: string = ok(await call(as, 'PUT', `/api/share?listId=${listId}`, { enabled: true }), 200, 'share').body.share.url;
  return url.slice(url.lastIndexOf('/') + 1);
}

/** Invites member to owner's person list and accepts. */
export async function joinPersonList(owner: TestUser, member: TestUser, listId: number) {
  const inv = ok(await call(owner, 'POST', '/api/members', { listId, email: member.email }), 201, 'invite');
  const link: string = inv.body.inviteUrl;
  ok(await call(member, 'POST', '/api/invite/accept', { token: link.slice(link.lastIndexOf('/') + 1) }), 200, 'accept');
}
