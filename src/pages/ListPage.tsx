import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Message } from '../app/Message';
import { AddItemDialog, looksLikeUrl, type AddStart } from '../items/AddItemDialog';
import { EditItemDrawer } from '../items/EditItemDrawer';
import { PRIORITY_LABEL } from '../items/ItemForm';
import { api, ApiError } from '../lib/api';
import { formatMoney, pluralise } from '../lib/format';
import { cancelDelete, scheduleDelete } from '../lib/pendingDelete';
import { keys } from '../lib/queryClient';
import type { Priority, WishItem, WishListDetail } from '../lib/types';
import { DeleteListDialog, OccasionDialog, RenameDialog } from '../lists/ListDialogs';
import { ShareDialog } from '../lists/ShareDialog';
import { Button, ButtonLink, Chip, Icon, IconButton, MenuButton, PillSelect, Segmented, Skeleton, Tile, useToast } from '../ui';
import page from './Page.module.css';
import styles from './ListPage.module.css';

type Filter = 'all' | Priority;
type Sort = 'prio' | 'new' | 'price';
type View = 'rows' | 'grid';

const VIEW_KEY = 'planary-wishlist-view';

function storedView(): View {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'rows';
  } catch {
    return 'rows';
  }
}

function useView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>(storedView);
  return [
    view,
    (v) => {
      setView(v);
      try {
        window.localStorage.setItem(VIEW_KEY, v);
      } catch {
        // Storage blocked: remembered for this page view.
      }
    },
  ];
}

const byNewest = (a: WishItem, b: WishItem) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id;
const SORTS: Record<Sort, (a: WishItem, b: WishItem) => number> = {
  prio: (a, b) => a.priority - b.priority || byNewest(a, b),
  new: byNewest,
  price: (a, b) => b.priceCents - a.priceCents || byNewest(a, b),
};

/** "CHF 1’146.65 in total". Other currencies aren't converted; they get a short note instead. */
function totalText(items: WishItem[]): string | null {
  const chf = items.filter((i) => i.currency === 'CHF').reduce((sum, i) => sum + i.priceCents, 0);
  const other = items.some((i) => i.currency !== 'CHF' && i.priceCents > 0);
  if (!chf && !other) return null;
  if (!chf) return 'Prices in other currencies';
  return `${formatMoney(chf)} in total${other ? ' + other currencies' : ''}`;
}

function Dots({ priority }: { priority: Priority }) {
  const filled = 4 - priority; // must have = 3 dots
  return (
    <span className={styles.dots} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <i key={i} className={i < filled ? styles.filled : undefined} />
      ))}
    </span>
  );
}

function StoreLink({ item }: { item: WishItem }) {
  if (!item.store) return <span>Added by hand</span>;
  if (!item.url) return <span>{item.store}</span>;
  return (
    <a className="ul" href={item.url} target="_blank" rel="noopener noreferrer">
      {item.store}
    </a>
  );
}

function Rows({ items, newId, onEdit }: { items: WishItem[]; newId: number | null; onEdit: (item: WishItem) => void }) {
  return (
    <ul className={styles.rows}>
      {items.map((it) => (
        <li key={it.id} className={[styles.row, it.id === newId && styles.isNew].filter(Boolean).join(' ')}>
          <Tile imageUrl={it.imageUrl} className={styles.rowTile} />
          <div className={styles.rowMain}>
            <p className={styles.name}>{it.name}</p>
            <p className={styles.sub}>
              <StoreLink item={it} />
              {it.note && <span>{it.note}</span>}
            </p>
          </div>
          <p className={styles.prio}>
            <Dots priority={it.priority as Priority} />
            {PRIORITY_LABEL[it.priority as Priority]}
          </p>
          <p className={styles.price}>{formatMoney(it.priceCents, it.currency)}</p>
          <div className={styles.rowAct}>
            <IconButton icon="edit" label={`Edit ${it.name}`} onClick={() => onEdit(it)} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Cards({ items, newId, onEdit }: { items: WishItem[]; newId: number | null; onEdit: (item: WishItem) => void }) {
  return (
    <ul className={styles.cards}>
      {items.map((it) => (
        <li key={it.id} className={[styles.card, it.id === newId && styles.isNew].filter(Boolean).join(' ')}>
          <Tile imageUrl={it.imageUrl} className={styles.cardTile} />
          <div className={styles.cardBody}>
            <div>
              <p className={styles.name}>{it.name}</p>
              <p className={styles.sub}>
                <span>{it.store || 'Added by hand'}</span>
                <span>{PRIORITY_LABEL[it.priority as Priority]}</span>
              </p>
            </div>
            <p className={styles.price}>{formatMoney(it.priceCents, it.currency)}</p>
          </div>
          <div className={styles.cardAct}>
            <Button variant="line" small icon="edit" aria-label={`Edit ${it.name}`} onClick={() => onEdit(it)}>
              Edit
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

type Overlay = { kind: 'add'; start: AddStart } | { kind: 'edit'; item: WishItem } | { kind: 'share' } | { kind: 'rename' } | { kind: 'date' } | { kind: 'delete' } | null;

function Wishlist({ list }: { list: WishListDetail }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('prio');
  const [view, setView] = useView();
  const [quick, setQuick] = useState('');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [newId, setNewId] = useState<number | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const key = keys.list(list.id);

  useEffect(() => {
    if (newId === null) return;
    const t = window.setTimeout(() => setNewId(null), 1800);
    return () => window.clearTimeout(t);
  }, [newId]);

  const setList = (update: (l: WishListDetail) => WishListDetail) => qc.setQueryData<WishListDetail>(key, (l) => (l ? update(l) : l));
  const refreshOverview = () => qc.invalidateQueries({ queryKey: keys.overview });

  const visible = useMemo(
    () => list.items.filter((i) => filter === 'all' || i.priority === filter).sort(SORTS[sort]),
    [list.items, filter, sort],
  );
  const total = totalText(list.items);

  const remove = (item: WishItem) => {
    const index = list.items.findIndex((i) => i.id === item.id);
    setList((l) => ({ ...l, items: l.items.filter((i) => i.id !== item.id) }));
    setOverlay(null);
    const deleteKey = `item:${item.id}`;
    scheduleDelete(deleteKey, () => {
      api
        .deleteItem(item.id)
        .catch(() => qc.invalidateQueries({ queryKey: key }))
        .finally(refreshOverview);
    });
    toast(`Removed from ${list.title}`, {
      undo: () => {
        if (!cancelDelete(deleteKey)) return;
        setList((l) => {
          const items = [...l.items];
          items.splice(Math.min(index, items.length), 0, item);
          return { ...l, items };
        });
      },
    });
  };

  const openQuick = () => {
    const text = quick.trim();
    setQuick('');
    if (!text) setOverlay({ kind: 'add', start: { step: 'paste' } });
    else if (looksLikeUrl(text)) setOverlay({ kind: 'add', start: { step: 'reading', url: text } });
    else setOverlay({ kind: 'add', start: { step: 'manual', name: text } });
  };

  return (
    <>
      <div className={page.ph}>
        <div>
          <p className={page.crumb}>
            <Link to="/app">My wishlists</Link>
          </p>
          <h1 className={page.h1}>{list.title}</h1>
          <p className={page.meta}>
            <span>{pluralise(list.items.length, 'item')}</span>
            {total && <span>{total}</span>}
            <span>
              <Icon name={list.share.enabled ? 'globe' : 'lock'} small />
              {list.share.enabled ? 'Shared by link' : 'Only you'}
            </span>
          </p>
        </div>
        <div className={page.actions}>
          <Button variant="line" small icon="share" onClick={() => setOverlay({ kind: 'share' })}>
            Share
          </Button>
          <MenuButton
            label="More options for this list"
            items={[
              { label: 'Rename', icon: 'edit', onSelect: () => setOverlay({ kind: 'rename' }) },
              { label: list.occasion ? 'Change date' : 'Set a date', icon: 'calendar', onSelect: () => setOverlay({ kind: 'date' }) },
              { label: 'Delete list', icon: 'trash', danger: true, onSelect: () => setOverlay({ kind: 'delete' }) },
            ]}
          />
        </div>
      </div>

      <form
        className={styles.addbar}
        onSubmit={(e) => {
          e.preventDefault();
          openQuick();
        }}
      >
        <Icon name="link" />
        <label className="sr-only" htmlFor="quick">
          Product link or name
        </label>
        <input id="quick" type="text" autoComplete="off" placeholder="Paste a link or type a name" value={quick} onChange={(e) => setQuick(e.target.value)} />
        <Button type="submit" small icon="plus">
          Add
        </Button>
      </form>

      {list.items.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyTile} aria-hidden="true">
            <Icon name="link" />
          </span>
          <h2>Nothing on {list.title} yet</h2>
          <p>Copy a product link from any shop and paste it above. We fill in the name, picture and price for you.</p>
        </div>
      ) : (
        <>
          <div className={styles.tools}>
            <div className={styles.chips} role="group" aria-label="Filter by priority">
              {(['all', 1, 2, 3] as Filter[]).map((f) => (
                <Chip key={f} pressed={filter === f} onClick={() => setFilter(f)}>
                  {f === 'all' ? 'All' : PRIORITY_LABEL[f]}
                </Chip>
              ))}
            </div>
            <div className={styles.toolsRight}>
              <PillSelect label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="prio">Priority</option>
                <option value="new">Newest</option>
                <option value="price">Price</option>
              </PillSelect>
              <Segmented
                label="Layout"
                value={view}
                onChange={setView}
                options={[
                  { value: 'rows', label: 'Rows', icon: 'rows' },
                  { value: 'grid', label: 'Grid', icon: 'grid' },
                ]}
              />
            </div>
          </div>
          {view === 'rows' ? (
            <Rows items={visible} newId={newId} onEdit={(item) => setOverlay({ kind: 'edit', item })} />
          ) : (
            <Cards items={visible} newId={newId} onEdit={(item) => setOverlay({ kind: 'edit', item })} />
          )}
          <p className={page.fine}>
            <Icon name="eyeOff" small />
            You won’t see what friends reserve, so your gifts stay a surprise.
          </p>
        </>
      )}

      {overlay?.kind === 'add' && (
        <AddItemDialog
          listId={list.id}
          kind="wish"
          targetName={list.title}
          start={overlay.start}
          onClose={() => setOverlay(null)}
          onAdded={(item) => {
            setList((l) => ({ ...l, items: [item as WishItem, ...l.items] }));
            setFilter('all');
            setNewId(item.id);
            refreshOverview();
          }}
        />
      )}
      {overlay?.kind === 'edit' && (
        <EditItemDrawer
          item={overlay.item}
          kind="wish"
          listTitle={list.title}
          onClose={() => setOverlay(null)}
          onSaved={(saved) => setList((l) => ({ ...l, items: l.items.map((i) => (i.id === saved.id ? (saved as WishItem) : i)) }))}
          onRemove={() => remove(overlay.item)}
        />
      )}
      {overlay?.kind === 'share' && <ShareDialog list={list} onClose={() => setOverlay(null)} />}
      {overlay?.kind === 'rename' && (
        <RenameDialog
          title={list.title}
          onClose={() => setOverlay(null)}
          onSave={async (title) => {
            const saved = (await api.updateList(list.id, { title })) as WishListDetail;
            qc.setQueryData(key, saved);
            refreshOverview();
          }}
        />
      )}
      {overlay?.kind === 'date' && (
        <OccasionDialog
          listId={list.id}
          occasion={list.occasion}
          onClose={() => setOverlay(null)}
          onSaved={(occasion) => {
            setList((l) => ({ ...l, occasion }));
            refreshOverview();
          }}
          onRemoved={() => {
            setList((l) => ({ ...l, occasion: null }));
            refreshOverview();
          }}
        />
      )}
      {overlay?.kind === 'delete' && (
        <DeleteListDialog
          title={list.title}
          itemCount={list.items.length}
          shared={list.share.enabled}
          onClose={() => setOverlay(null)}
          onDelete={async () => {
            await api.deleteList(list.id);
            qc.removeQueries({ queryKey: key });
            await refreshOverview();
            navigate('/app');
            toast('List deleted');
          }}
        />
      )}
    </>
  );
}

/** A wishlist · /app/lists/:id (SCREENS.md §2). */
export function ListPage() {
  const id = Number(useParams().id);
  const { data, error, isPending } = useQuery({ queryKey: keys.list(id), queryFn: () => api.list(id), enabled: Number.isInteger(id) && id > 0 });

  if (!Number.isInteger(id) || id <= 0 || (error instanceof ApiError && error.status === 404)) {
    return (
      <Message inline title="We couldn’t find that list" action={<ButtonLink to="/app">Go to your lists</ButtonLink>}>
        It may have been deleted, or the link is wrong.
      </Message>
    );
  }
  if (error)
    return (
      <Message inline title="That didn’t load">
        Reload the page to try again.
      </Message>
    );
  if (isPending) {
    return (
      <div aria-label="Loading">
        <Skeleton width={120} height={13} />
        <Skeleton width="40%" height={40} radius={10} className={styles.loadingTitle} />
      </div>
    );
  }
  if (data.kind === 'person') return <Navigate to={`/app/people/${data.id}`} replace />;
  return <Wishlist key={data.id} list={data} />;
}
