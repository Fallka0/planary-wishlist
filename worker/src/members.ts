import type { InvitePreview, InviteResponse, Member } from '../../src/lib/types';
import { isOwner, listAccess, people, requireOwner } from './access';
import { all, first, NOW, run } from './db';
import type { Env, User } from './env';
import { forbidden, invalid, notFound } from './errors';
import { mailEnabled, sendMail } from './mail';
import { cleanEmail, displayName, hashToken, newSecretToken } from './util';

const inviteURL = (baseURL: string, token: string) => `${baseURL.replace(/\/+$/, '')}/invite/${token}`;

/** The co-planners of a person list, active and invited, oldest first. */
export async function listMembers(db: D1Database, listId: number, me: string): Promise<Member[]> {
  const rows = await all<{ id: number; email: string; user_id: string | null; status: Member['status'] }>(
    db,
    'SELECT id, email, user_id, status FROM list_members WHERE list_id = ? ORDER BY created_at, id',
    listId,
  );
  const refs = await people(db, rows.map((r) => r.user_id ?? ''), me);
  return rows.map((r) => ({ id: r.id, email: r.email, status: r.status, user: r.user_id ? refs.get(r.user_id)! : null }));
}

/** Asks someone by email to plan a person list together. Owners only. */
export async function invite(env: Env, user: User, listId: number, rawEmail: string, baseURL: string): Promise<InviteResponse> {
  const db = env.DB;
  const a = await listAccess(db, listId, user.id);
  if (a.kind !== 'person') throw invalid('Only gift idea lists can be planned together.');
  requireOwner(a, 'Only the person who started this list can invite others.');
  const email = cleanEmail(rawEmail);
  if (email === user.email.toLowerCase()) throw invalid('That’s you. Invite someone else.');

  const token = newSecretToken();
  const row = await first<{ id: number; status: Member['status'] }>(
    db,
    `INSERT INTO list_members (list_id, email, invite_token_hash, invited_by) VALUES (?, ?, ?, ?)
     ON CONFLICT (list_id, email) DO UPDATE SET invite_token_hash = excluded.invite_token_hash
       WHERE list_members.status = 'invited'
     RETURNING id, status`,
    listId, email, await hashToken(token), user.id,
  );
  if (!row) throw invalid(`${email} is already planning with you.`);

  const link = inviteURL(baseURL, token);
  let sent = false;
  if (mailEnabled(env)) {
    const inviter = displayName(user);
    sent = await sendMail(
      env,
      email,
      `${inviter} invited you to plan gifts for ${a.title}`,
      `${inviter} wants to plan gifts for ${a.title} together on Planary Wishlist.\n\n` +
        `Open this link to join. You sign in with your Planary account, or create one:\n${link}\n`,
    );
  }
  return { member: { id: row.id, email, status: row.status, user: null }, inviteUrl: link, emailSent: sent };
}

/** The owner removes anyone; a co-planner can remove themselves (leave). */
export async function removeMember(db: D1Database, userId: string, memberId: number) {
  const m = await first<{ list_id: number; user_id: string | null }>(db, 'SELECT list_id, user_id FROM list_members WHERE id = ?', memberId);
  if (!m) throw notFound();
  const a = await listAccess(db, m.list_id, userId);
  if (!isOwner(a) && m.user_id !== userId) throw forbidden('Only the person who started this list can remove others.');
  await run(db, 'DELETE FROM list_members WHERE id = ?', memberId);
}

/** A new reusable invite link for a person list. The previous link stops working. */
export async function inviteLink(db: D1Database, userId: string, listId: number, baseURL: string): Promise<string> {
  const a = await listAccess(db, listId, userId);
  if (a.kind !== 'person') throw invalid('Only gift idea lists can be planned together.');
  requireOwner(a, 'Only the person who started this list can invite others.');
  const token = newSecretToken();
  await run(db, 'UPDATE lists SET invite_token_hash = ? WHERE id = ?', await hashToken(token), listId);
  return inviteURL(baseURL, token);
}

/** A resolved invite token: a personal invite (memberId set) or a list's reusable link. */
interface Invite {
  listId: number;
  listTitle: string;
  ownerId: string;
  invitedBy: string;
  memberId: number;
  email: string; // personal invites only
}

async function findInvite(db: D1Database, token: string): Promise<Invite> {
  const hash = await hashToken(token.trim());
  const personal = await first<{ list_id: number; title: string; owner_id: string; invited_by: string; id: number; email: string }>(
    db,
    `SELECT l.id AS list_id, l.title, l.owner_id, m.invited_by, m.id, m.email
     FROM list_members m JOIN lists l ON l.id = m.list_id
     WHERE m.invite_token_hash = ? AND m.status = 'invited'`,
    hash,
  );
  if (personal) {
    return { listId: personal.list_id, listTitle: personal.title, ownerId: personal.owner_id, invitedBy: personal.invited_by, memberId: personal.id, email: personal.email };
  }
  const reusable = await first<{ id: number; title: string; owner_id: string }>(
    db,
    `SELECT id, title, owner_id FROM lists WHERE invite_token_hash = ? AND kind = 'person'`,
    hash,
  );
  if (!reusable) throw notFound();
  return { listId: reusable.id, listTitle: reusable.title, ownerId: reusable.owner_id, invitedBy: reusable.owner_id, memberId: 0, email: '' };
}

async function isActiveMember(db: D1Database, listId: number, userId: string): Promise<boolean> {
  const row = await first(db, `SELECT 1 FROM list_members WHERE list_id = ? AND user_id = ? AND status = 'active'`, listId, userId);
  return row !== null;
}

/** What the invite page shows before joining. */
export async function previewInvite(db: D1Database, userId: string, token: string): Promise<InvitePreview> {
  const inv = await findInvite(db, token);
  const refs = await people(db, [inv.invitedBy], userId);
  return {
    listTitle: inv.listTitle,
    invitedBy: refs.get(inv.invitedBy)!,
    alreadyMember: inv.ownerId === userId || (await isActiveMember(db, inv.listId, userId)),
  };
}

/** Makes the user an active co-planner. A personal invite only works for the email it was sent to. */
export async function acceptInvite(db: D1Database, user: User, token: string): Promise<number> {
  const inv = await findInvite(db, token);
  if (inv.ownerId === user.id) throw invalid('This is your own list.');
  if (await isActiveMember(db, inv.listId, user.id)) {
    // A second invite for someone already on the list: drop it.
    if (inv.memberId) await run(db, `DELETE FROM list_members WHERE id = ? AND status = 'invited'`, inv.memberId);
    return inv.listId;
  }
  if (inv.memberId) {
    if (inv.email.toLowerCase() !== user.email.toLowerCase()) {
      throw forbidden(`This invite was sent to ${inv.email}. Sign in with that address to accept it.`);
    }
    await run(
      db,
      `UPDATE list_members SET user_id = ?, status = 'active', joined_at = ${NOW}, invite_token_hash = NULL WHERE id = ?`,
      user.id, inv.memberId,
    );
  } else {
    await run(
      db,
      `INSERT INTO list_members (list_id, email, user_id, status, invited_by, joined_at)
       VALUES (?, ?, ?, 'active', ?, ${NOW})
       ON CONFLICT (list_id, email) DO UPDATE
       SET user_id = excluded.user_id, status = 'active', joined_at = ${NOW}, invite_token_hash = NULL`,
      inv.listId, user.email.toLowerCase(), user.id, inv.ownerId,
    );
  }
  return inv.listId;
}
