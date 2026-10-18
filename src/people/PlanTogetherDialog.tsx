import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { copyText } from '../lib/clipboard';
import { possessive } from '../lib/comingUp';
import { keys } from '../lib/queryClient';
import type { Member, PersonListDetail } from '../lib/types';
import { Avatar, Button, Dialog, IconButton, TextField, useToast } from '../ui';
import styles from './People.module.css';

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'That didn’t work. Try again.');

/** A member's name as the list shows it: their Planary name once they've joined, the email before. */
export function memberName(m: Member): string {
  return m.user ? m.user.name : m.email;
}

/**
 * Invite co-planners to a person list (SCREENS.md §7). Only the person who started the list can
 * invite or remove others; a co-planner sees who's on it (and leaves from the list's menu).
 */
export function PlanTogetherDialog({ list, onClose }: { list: PersonListDetail; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  /** When the browser won't copy, the link is shown so it can be copied by hand. */
  const [manualLink, setManualLink] = useState<{ url: string; to?: string } | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const isOwner = list.role === 'owner';
  const key = keys.list(list.id);

  const setMembers = (update: (members: Member[]) => Member[]) =>
    qc.setQueryData<PersonListDetail>(key, (l) => (l ? { ...l, members: update(l.members) } : l));

  const invite = useMutation({
    mutationFn: (to: string) => api.invite(list.id, to),
    onSuccess: async (res, to) => {
      setMembers((members) => [...members.filter((m) => m.id !== res.member.id), res.member]);
      qc.invalidateQueries({ queryKey: keys.overview });
      setEmail('');
      if (res.emailSent) {
        toast(`Invite sent to ${to}`);
      } else if (await copyText(res.inviteUrl)) {
        setManualLink(null);
        toast(`Invite link copied. Send it to ${to}.`);
      } else {
        setManualLink({ url: res.inviteUrl, to });
      }
    },
    onError: (e) => setError(errorText(e)),
  });

  const copyLink = useMutation({
    mutationFn: () => api.inviteLink(list.id),
    onSuccess: async (url) => {
      if (await copyText(url)) {
        setManualLink(null);
        toast('Invite link copied');
      } else {
        setManualLink({ url });
      }
    },
    onError: (e) => toast(errorText(e)),
  });

  const remove = useMutation({
    mutationFn: (m: Member) => api.removeMember(m.id),
    onSuccess: (_, m) => {
      qc.invalidateQueries({ queryKey: keys.overview });
      setMembers((members) => members.filter((x) => x.id !== m.id));
    },
    onError: (e) => toast(errorText(e)),
  });

  const submit = () => {
    const to = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      setError('Enter an email address, like name@example.ch.');
      return;
    }
    invite.mutate(to);
  };

  return (
    <Dialog
      title={`Plan ${possessive(list.title)} gifts together`}
      subtitle={`Co-planners can add ideas and see who’s getting what. ${list.title} never sees this list.`}
      onClose={onClose}
      onSubmit={isOwner ? submit : undefined}
      footer={
        <>
          {isOwner && (
            <Button variant="ghost" icon="link" className="grow" disabled={copyLink.isPending} onClick={() => copyLink.mutate()}>
              Copy invite link
            </Button>
          )}
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      {isOwner && (
        <TextField
          label="Invite by email"
          type="email"
          autoComplete="email"
          placeholder="name@example.ch"
          value={email}
          error={error}
          help="They sign in with their Planary account, or create one."
          onChange={(e) => {
            setEmail(e.target.value);
            setError('');
          }}
          addon={
            <Button type="submit" disabled={invite.isPending}>
              Invite
            </Button>
          }
        />
      )}
      {manualLink && (
        <TextField
          label={manualLink.to ? `Invite link for ${manualLink.to}` : 'Invite link'}
          help="Copy it and send it yourself."
          value={manualLink.url}
          readOnly
          onFocus={(e) => e.target.select()}
        />
      )}
      <ul className={styles.people} aria-label="People on this list">
        <li>
          <Avatar name={list.owner.name} me={list.owner.isMe} />
          <span className={styles.who}>
            <span className={styles.name}>
              {list.owner.name}
              {list.owner.isMe && ' (you)'}
            </span>
            <span className={styles.role}>Started this list</span>
          </span>
        </li>
        {list.members.map((m) => {
          const name = memberName(m);
          const me = !!m.user?.isMe;
          return (
            <li key={m.id}>
              <Avatar name={m.user ? m.user.name : m.email.split('@')[0]} me={me} />
              <span className={styles.who}>
                <span className={styles.name}>
                  {name}
                  {me && ' (you)'}
                </span>
                <span className={styles.role}>{m.status === 'active' ? 'Can add ideas' : 'Invite sent, not joined yet'}</span>
              </span>
              {isOwner && <IconButton icon="x" label={`Remove ${name}`} disabled={remove.isPending} onClick={() => remove.mutate(m)} />}
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
