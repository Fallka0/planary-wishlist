import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { possessive } from '../lib/comingUp';
import { formatDate, formatMoney, nextOccurrence, pluralise, todayInZurich } from '../lib/format';
import { PRIORITY_LABEL } from '../items/ItemForm';
import { keys } from '../lib/queryClient';
import { redirectToSignIn } from '../lib/session';
import type { Priority, PublicItem, PublicListResponse } from '../lib/types';
import { forgetUndoToken, saveUndoToken, undoTokens } from '../lib/undoTokens';
import { Avatar, Button, Icon, IconAnchor, Tag, Tile, useToast } from '../ui';
import { ReserveDialog, UndoDialog } from './ReserveDialogs';
import styles from './Shared.module.css';

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'That didn’t work. Try again.');
const firstName = (name: string) => name.split(/\s+/)[0] || name;

/**
 * A guest's own reservations come back as "taken"; the undo tokens kept in this browser turn them
 * back into "mine".
 */
function withLocalClaims(items: PublicItem[], tokens: Record<string, string>): PublicItem[] {
  return items.map((i) => (i.status === 'taken' && tokens[i.id] ? { ...i, status: 'mine' } : i));
}

/** Friends see must-haves first; within a priority the owner's order stays (sort is stable). */
const byPriority = (a: PublicItem, b: PublicItem) => a.priority - b.priority;

function Card({
  item,
  busy,
  onReserve,
  onUndo,
}: {
  item: PublicItem;
  busy: boolean;
  onReserve: () => void;
  onUndo: () => void;
}) {
  const taken = item.status === 'taken';
  return (
    <li className={[styles.card, taken && styles.taken].filter(Boolean).join(' ')}>
      <Tile imageUrl={item.imageUrl} className={styles.tile} />
      <div className={styles.cardBody}>
        <div>
          <p className={styles.name}>{item.name}</p>
          <p className={styles.sub}>
            {item.store && <span>{item.store}</span>}
            <span>{PRIORITY_LABEL[item.priority as Priority]}</span>
          </p>
        </div>
        <p className={styles.price}>{formatMoney(item.priceCents, item.currency)}</p>
      </div>
      {item.note && <p className={styles.note}>“{item.note}”</p>}
      {item.status !== 'hidden' && (
        <div className={styles.actions}>
          {item.status === 'free' && (
            <>
              <Button small className={styles.reserve} disabled={busy} onClick={onReserve}>
                I’ll get this
              </Button>
              {item.url && (
                <IconAnchor
                  icon="external"
                  label={`Open ${item.name} on ${item.store || 'the shop’s site'}`}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              )}
            </>
          )}
          {item.status === 'mine' && (
            <>
              <Tag ok>You’re getting this</Tag>
              <Button variant="ghost" small disabled={busy} onClick={onUndo}>
                Undo
              </Button>
            </>
          )}
          {taken && <Tag>Someone’s getting this</Tag>}
        </div>
      )}
    </li>
  );
}

/**
 * A shared wishlist as a friend sees it (SCREENS.md §8): on the public link, or inside the app from
 * "Shared with me". The list's owner gets a preview without reservations or buttons.
 */
export function SharedList({
  token,
  data,
  inApp,
  undoItemId = null,
}: {
  token: string;
  data: PublicListResponse;
  inApp: boolean;
  /** The item named by an emailed undo link, which opens the undo dialog. */
  undoItemId?: number | null;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reserving, setReserving] = useState<PublicItem | null>(null);
  const [reserveError, setReserveError] = useState('');
  const [undoing, setUndoing] = useState<number | null>(undoItemId);
  const { list, viewer } = data;
  const key = keys.shared(token);
  const owner = firstName(list.owner.name);
  const items = withLocalClaims(list.items, undoTokens(token)).sort(byPriority);
  const free = items.filter((i) => i.status === 'free').length;
  const today = todayInZurich();
  const date = list.occasion && nextOccurrence(list.occasion, today);

  // A signed-in visitor now follows the list: it shows under "Shared with me".
  useEffect(() => {
    if (viewer.signedIn && !viewer.isOwner) qc.invalidateQueries({ queryKey: keys.overview });
  }, [viewer.signedIn, viewer.isOwner, qc]);

  const putItem = (item: PublicItem) =>
    qc.setQueryData<PublicListResponse>(key, (d) => (d ? { ...d, list: { ...d.list, items: d.list.items.map((i) => (i.id === item.id ? item : i)) } } : d));

  const reserve = useMutation({
    mutationFn: ({ item, email }: { item: PublicItem; email?: string }) => api.reserve(token, item.id, email),
    onMutate: ({ item }) => setBusyId(item.id),
    onSuccess: (res) => {
      if (res.undoToken) saveUndoToken(token, res.item.id, res.undoToken);
      putItem(res.item);
      setReserving(null);
      qc.invalidateQueries({ queryKey: keys.overview });
      toast(inApp ? 'Reserved. Others now see it as taken.' : 'Reserved. Everyone else now sees it as taken.');
    },
    onError: (e, { email }) => {
      // In the guest dialog a bad email stays in the form; anything else closes it and refreshes.
      if (email !== undefined && e instanceof ApiError && e.code === 'invalid') {
        setReserveError(e.message);
        return;
      }
      setReserving(null);
      toast(errorText(e));
      qc.invalidateQueries({ queryKey: key });
    },
    onSettled: () => setBusyId(null),
  });

  const undo = useMutation({
    mutationFn: (item: PublicItem) => api.unreserve(token, item.id, undoTokens(token)[item.id]),
    onMutate: (item) => setBusyId(item.id),
    onSuccess: (item) => {
      forgetUndoToken(token, item.id);
      putItem(item);
      if (undoing !== null) toast('Undone. It’s free again.');
      setUndoing(null);
      qc.invalidateQueries({ queryKey: keys.overview });
    },
    onError: (e, item) => {
      // The reservation is already gone (or the token no longer matches): show the list as it is.
      const gone = e instanceof ApiError && e.status === 404;
      if (gone) forgetUndoToken(token, item.id);
      setUndoing(null);
      toast(gone ? 'That reservation is already gone.' : errorText(e));
      qc.invalidateQueries({ queryKey: key });
    },
    onSettled: () => setBusyId(null),
  });

  const undoItem = undoing === null ? undefined : items.find((i) => i.id === undoing);
  // The emailed link names an item that isn't reserved by this person (anymore): nothing to undo.
  useEffect(() => {
    if (undoing === null || undoItem?.status === 'mine') return;
    forgetUndoToken(token, undoing);
    setUndoing(null);
    toast(undoItem ? 'That reservation is already gone.' : 'That item isn’t on the list anymore.');
  }, [undoing, undoItem, token, toast]);

  return (
    <div className={styles.vis}>
      <p className={styles.own}>
        <Avatar name={list.owner.name} me />
        {inApp ? `${list.owner.name} shared this with you` : `${possessive(list.owner.name)} wishlist`}
      </p>
      <h1 className={styles.h1}>{list.title}</h1>
      <p className={styles.meta}>
        {date && (
          <span>
            <Icon name="calendar" small />
            {formatDate(date, today)}
          </span>
        )}
        <span>
          {pluralise(items.length, 'idea')}
          {!viewer.isOwner && ` · ${free} still free`}
        </span>
      </p>
      <p className={styles.hint}>
        <Icon name={viewer.isOwner ? 'eyeOff' : 'gift'} />
        <span>
          {viewer.isOwner
            ? 'This is what friends see. Reservations are hidden from you.'
            : `Pick something and tap “I’ll get this”. ${owner} won’t see what’s reserved or by whom, so it stays a surprise.`}
        </span>
      </p>
      {items.length === 0 ? (
        <p className={styles.none}>Nothing on this list yet.</p>
      ) : (
        <ul className={styles.cards}>
          {items.map((item) => (
            <Card
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onReserve={() => {
                if (viewer.signedIn) reserve.mutate({ item });
                else {
                  setReserveError('');
                  setReserving(item);
                }
              }}
              onUndo={() => undo.mutate(item)}
            />
          ))}
        </ul>
      )}
      {reserving && (
        <ReserveDialog
          item={reserving}
          ownerFirstName={owner}
          pending={reserve.isPending}
          error={reserveError}
          onSignIn={() => redirectToSignIn()}
          onClose={() => setReserving(null)}
          onReserve={(email) => reserve.mutate({ item: reserving, email })}
        />
      )}
      {undoItem?.status === 'mine' && (
        <UndoDialog item={undoItem} pending={undo.isPending} onClose={() => setUndoing(null)} onUndo={() => undo.mutate(undoItem)} />
      )}
    </div>
  );
}

/**
 * The undo link from the reservation email: /w/<token>?undo=<undoToken>&item=<itemId>. The token
 * is kept like one from this browser, and the page asks before undoing.
 */
export function useUndoLink(token: string): number | null {
  const [params, setParams] = useSearchParams();
  const [itemId] = useState<number | null>(() => {
    const undo = params.get('undo');
    const item = Number(params.get('item'));
    if (!undo || !Number.isInteger(item) || item <= 0) return null;
    saveUndoToken(token, item, undo);
    return item;
  });
  useEffect(() => {
    if (params.has('undo') || params.has('item')) setParams({}, { replace: true });
  }, [params, setParams]);
  return itemId;
}
