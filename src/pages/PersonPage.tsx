import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Message } from '../app/Message';
import { AddItemDialog, looksLikeUrl, type AddStart } from '../items/AddItemDialog';
import { EditItemDrawer } from '../items/EditItemDrawer';
import { api, ApiError } from '../lib/api';
import { countdown, formatAmount, formatDate, formatMoney, todayInZurich } from '../lib/format';
import { budgetOf, nextOf, upcoming, type Upcoming } from '../lib/occasions';
import { cancelDelete, scheduleDelete } from '../lib/pendingDelete';
import { keys } from '../lib/queryClient';
import type { Idea, Occasion, PersonListDetail, PersonRef } from '../lib/types';
import { DeleteListDialog, OccasionDialog } from '../lists/ListDialogs';
import { LeaveDialog, PersonNameDialog } from '../people/PersonDialogs';
import { PlanTogetherDialog } from '../people/PlanTogetherDialog';
import { Avatar, AvatarStack, Button, ButtonLink, Chip, Icon, MenuButton, ProgressBar, Skeleton, Tag, TextArea, Tile, useToast, type MenuItem } from '../ui';
import listStyles from './ListPage.module.css';
import page from './Page.module.css';
import styles from './PersonPage.module.css';

type Filter = 'all' | 'open' | 'taken';
const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['open', 'Nobody’s on it'],
  ['taken', 'Someone’s getting it'],
];

type Overlay =
  | { kind: 'add'; start: AddStart }
  | { kind: 'edit'; idea: Idea }
  | { kind: 'plan' }
  | { kind: 'occasion'; occasion: Occasion | null }
  | { kind: 'rename' }
  | { kind: 'delete' }
  | { kind: 'leave' }
  | null;

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'That didn’t work. Try again.');

/** "Lea" from "Lea Brunner": rows and tags use first names, like the design. */
const firstName = (p: PersonRef) => p.name.split(/\s+/)[0] || p.name;

/** Everyone else planning this list: the owner (unless that's you) and the co-planners, joined or invited. */
function coPlanners(list: PersonListDetail): PersonRef[] {
  const others: PersonRef[] = list.owner.isMe ? [] : [list.owner];
  for (const m of list.members) {
    if (m.user?.isMe) continue;
    others.push(m.user ?? { id: `invite-${m.id}`, name: m.email.split('@')[0], initials: '', isMe: false });
  }
  return others;
}

/** You may change an idea on a list you own, or one you added yourself. */
const canChange = (list: PersonListDetail, idea: Idea) => list.role === 'owner' || idea.addedBy.isMe;

function IdeaRow({
  idea,
  list,
  next,
  isNew,
  onEdit,
  onPick,
  onClaim,
  onUnclaim,
  busy,
}: {
  idea: Idea;
  list: PersonListDetail;
  next: Occasion | null;
  isNew: boolean;
  onEdit: () => void;
  onPick: (picked: boolean) => void;
  onClaim: () => void;
  onUnclaim: () => void;
  busy: boolean;
}) {
  const picked = next ? idea.pickedFor.includes(next.id) : false;
  const by = idea.addedBy.isMe ? 'Added by you' : `Added by ${firstName(idea.addedBy)}`;
  return (
    <li className={[listStyles.row, styles.irow, isNew && listStyles.isNew].filter(Boolean).join(' ')}>
      <Tile imageUrl={idea.imageUrl} className={[listStyles.rowTile, styles.ideaTile].join(' ')} />
      <div className={listStyles.rowMain}>
        {canChange(list, idea) ? (
          <button type="button" className={[listStyles.name, styles.nameBtn].join(' ')} onClick={onEdit} aria-label={`Edit ${idea.name}`}>
            {idea.name}
          </button>
        ) : (
          <p className={listStyles.name}>{idea.name}</p>
        )}
        <p className={listStyles.sub}>
          {idea.store && idea.url ? (
            <a className="ul" href={idea.url} target="_blank" rel="noopener noreferrer">
              {idea.store}
            </a>
          ) : (
            <span>{idea.store || 'No shop yet'}</span>
          )}
          <span>{by}</span>
        </p>
      </div>
      {next && (
        <button
          type="button"
          className={[styles.pick, picked && styles.pickOn].filter(Boolean).join(' ')}
          aria-pressed={picked}
          aria-label={`Count toward ${next.label.toLowerCase()} budget: ${idea.name}`}
          onClick={() => onPick(!picked)}
        >
          <Icon name="check" small />
          {next.label}
        </button>
      )}
      <div className={styles.claim}>
        {!idea.reservedBy ? (
          <Button variant="line" small disabled={busy} onClick={onClaim}>
            I’ll get this
          </Button>
        ) : idea.reservedBy.isMe ? (
          <>
            <Tag ok>You’re getting this</Tag>
            <Button variant="ghost" small disabled={busy} onClick={onUnclaim}>
              Undo
            </Button>
          </>
        ) : (
          <Tag>{firstName(idea.reservedBy)} is getting this</Tag>
        )}
      </div>
      <p className={listStyles.price}>{formatMoney(idea.priceCents, idea.currency)}</p>
    </li>
  );
}

function OccasionsBox({ list, dates, onOpen }: { list: PersonListDetail; dates: Upcoming[]; onOpen: (o: Occasion | null) => void }) {
  return (
    <section className={styles.box} aria-labelledby="h-occ">
      <div className={styles.boxHead}>
        <h2 id="h-occ" className={page.h2}>
          Occasions
        </h2>
        <Button variant="ghost" small icon="plus" aria-label={`Add a date for ${list.title}`} onClick={() => onOpen(null)}>
          Add
        </Button>
      </div>
      {dates.length === 0 ? (
        <p className={styles.none}>No dates yet. Add a birthday or holiday to see it on your overview.</p>
      ) : (
        <ul>
          {dates.map(({ occ, date, days }) => (
            <li key={occ.id}>
              <button type="button" className={styles.orow} onClick={() => onOpen(occ)} aria-label={`Change ${occ.label}`}>
                <Icon name="calendar" />
                <span className={styles.oMain}>
                  <span className={styles.oTitle}>{occ.label}</span>
                  <span className={styles.oDate}>{date ? formatDate(date) : `${occ.day}.${occ.month}.${occ.year}`}</span>
                </span>
                <span className={styles.oDays}>{days === null ? 'Passed' : countdown(days)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BudgetBox({ items, occ, onChange }: { items: Idea[]; occ: Occasion; onChange: () => void }) {
  const b = budgetOf(items, occ);
  const budget = occ.budgetCents;
  return (
    <section className={styles.box} aria-labelledby="h-bud">
      <div className={styles.boxHead}>
        <h2 id="h-bud" className={page.h2}>
          Budget · {occ.label}
        </h2>
        <Button variant="ghost" small aria-label={`Change the ${occ.label.toLowerCase()} budget`} onClick={onChange}>
          Change
        </Button>
      </div>
      <p className={styles.bud}>
        <span className={styles.big}>{formatAmount(b.spentCents)}</span>
        <span>{budget ? `of CHF ${formatAmount(budget)}` : 'picked, no budget yet'}</span>
      </p>
      {b.share !== null && <ProgressBar value={b.share} label={`${occ.label} budget used`} />}
      <p className={styles.budFoot}>
        <span>
          {b.picked} {b.picked === 1 ? 'idea' : 'ideas'} picked
        </span>
        {b.leftCents !== null && <span>{b.leftCents >= 0 ? `CHF ${formatAmount(b.leftCents)} left` : `CHF ${formatAmount(-b.leftCents)} over`}</span>}
      </p>
    </section>
  );
}

function NotesBox({ list, onSave }: { list: PersonListDetail; onSave: (notes: string[]) => Promise<unknown> }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const toast = useToast();
  const isOwner = list.role === 'owner';
  const save = useMutation({
    mutationFn: () => onSave(text.split('\n')),
    onSuccess: () => {
      setEditing(false);
      toast('Notes saved');
    },
    onError: (e) => setError(errorText(e)),
  });

  return (
    <section className={styles.box} aria-labelledby="h-notes">
      <div className={styles.boxHead}>
        <h2 id="h-notes" className={page.h2}>
          Notes
        </h2>
        {isOwner && !editing && (
          <Button
            variant="ghost"
            small
            icon="edit"
            aria-label={`Edit notes about ${list.title}`}
            onClick={() => {
              setText(list.personNotes.join('\n'));
              setError('');
              setEditing(true);
            }}
          >
            Edit
          </Button>
        )}
      </div>
      {editing ? (
        <form
          className={styles.notesForm}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <TextArea
            label={<span className="sr-only">Notes about {list.title}</span>}
            help="One note per line."
            placeholder="Sizes, favourite colours, things they already own."
            value={text}
            error={error}
            rows={6}
            autoFocus
            onChange={(e) => {
              setText(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setEditing(false);
              }
            }}
          />
          <div className={styles.notesActions}>
            <Button variant="ghost" small onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" small disabled={save.isPending}>
              Save
            </Button>
          </div>
        </form>
      ) : list.personNotes.length === 0 ? (
        <p className={styles.none}>Sizes, favourite colours, things they already own.</p>
      ) : (
        <ul className={styles.notes}>
          {list.personNotes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Person({ list }: { list: PersonListDetail }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [quick, setQuick] = useState('');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [newId, setNewId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const key = keys.list(list.id);
  const isOwner = list.role === 'owner';

  useEffect(() => {
    if (newId === null) return;
    const t = window.setTimeout(() => setNewId(null), 1800);
    return () => window.clearTimeout(t);
  }, [newId]);

  const today = todayInZurich();
  const dates = upcoming(list.occasions, today);
  const next = nextOf(list.occasions, today)?.occ ?? null;
  const planners = coPlanners(list);

  const setList = (update: (l: PersonListDetail) => PersonListDetail) => qc.setQueryData<PersonListDetail>(key, (l) => (l ? update(l) : l));
  const putIdea = (idea: Idea) => setList((l) => ({ ...l, items: l.items.map((i) => (i.id === idea.id ? idea : i)) }));
  const refreshOverview = () => qc.invalidateQueries({ queryKey: keys.overview });

  const visible = list.items.filter((i) => filter === 'all' || (filter === 'open' ? !i.reservedBy : !!i.reservedBy));

  const pick = useMutation({
    mutationFn: ({ idea, picked }: { idea: Idea; picked: boolean }) => api.setPick(idea.id, next!.id, picked),
    onMutate: ({ idea, picked }) => {
      const pickedFor = picked ? [...idea.pickedFor, next!.id] : idea.pickedFor.filter((id) => id !== next!.id);
      putIdea({ ...idea, pickedFor });
    },
    onSuccess: (idea) => {
      putIdea(idea);
      refreshOverview();
    },
    onError: (e, { idea }) => {
      putIdea(idea);
      toast(errorText(e));
    },
  });

  const claim = useMutation({
    mutationFn: ({ idea, mine }: { idea: Idea; mine: boolean }) => (mine ? api.claim(idea.id) : api.unclaim(idea.id)),
    onMutate: ({ idea }) => setBusyId(idea.id),
    onSuccess: (idea, { mine }) => {
      putIdea(idea);
      refreshOverview();
      if (mine) toast(`Marked as yours. Co-planners see it, ${list.title} doesn’t.`);
    },
    onError: (e) => {
      toast(errorText(e));
      // Someone else got there first: show who.
      qc.invalidateQueries({ queryKey: key });
    },
    onSettled: () => setBusyId(null),
  });

  const remove = (idea: Idea) => {
    const index = list.items.findIndex((i) => i.id === idea.id);
    setList((l) => ({ ...l, items: l.items.filter((i) => i.id !== idea.id) }));
    setOverlay(null);
    const deleteKey = `item:${idea.id}`;
    scheduleDelete(deleteKey, () => {
      api
        .deleteItem(idea.id)
        .catch(() => qc.invalidateQueries({ queryKey: key }))
        .finally(refreshOverview);
    });
    toast(`Removed from ${list.title}`, {
      undo: () => {
        if (!cancelDelete(deleteKey)) return;
        setList((l) => {
          const items = [...l.items];
          items.splice(Math.min(index, items.length), 0, idea);
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

  const menu: MenuItem[] = isOwner
    ? [
        { label: 'Rename', icon: 'edit', onSelect: () => setOverlay({ kind: 'rename' }) },
        { label: 'Delete list', icon: 'trash', danger: true, onSelect: () => setOverlay({ kind: 'delete' }) },
      ]
    : [{ label: 'Leave list', icon: 'x', danger: true, onSelect: () => setOverlay({ kind: 'leave' }) }];

  return (
    <>
      <div className={page.ph}>
        <div>
          <p className={page.crumb}>
            <Link to="/app">Gift ideas</Link>
          </p>
          <div className={styles.id}>
            <Avatar name={list.personFullName || list.title} size={64} />
            <div>
              <h1 className={page.h1}>{list.title}</h1>
              <p className={page.meta}>
                {list.personFullName && <span>{list.personFullName}</span>}
                <span>
                  <Icon name="lock" small />
                  {list.title} can’t see this list
                </span>
              </p>
            </div>
          </div>
        </div>
        <div className={page.actions}>
          <AvatarStack people={planners} size={32} ring="var(--paper)" />
          <Button variant="line" small icon="users" onClick={() => setOverlay({ kind: 'plan' })}>
            Plan together
          </Button>
          <MenuButton label="More options for this list" items={menu} />
        </div>
      </div>

      <div className={styles.grid}>
        <section className={styles.main} aria-label="Ideas">
          <form
            className={listStyles.addbar}
            onSubmit={(e) => {
              e.preventDefault();
              openQuick();
            }}
          >
            <Icon name="link" />
            <label className="sr-only" htmlFor="quick">
              Idea link or name
            </label>
            <input id="quick" type="text" autoComplete="off" placeholder="Paste a link or note an idea" value={quick} onChange={(e) => setQuick(e.target.value)} />
            <Button type="submit" small icon="plus">
              Add
            </Button>
          </form>

          {list.items.length === 0 ? (
            <div className={listStyles.empty}>
              <span className={listStyles.emptyTile} aria-hidden="true">
                <Icon name="gift" />
              </span>
              <h2>No ideas for {list.title} yet</h2>
              <p>Paste a link above or just type an idea. Add a date on the right to get a countdown and a budget.</p>
            </div>
          ) : (
            <>
              <div className={listStyles.tools}>
                <div className={listStyles.chips} role="group" aria-label="Filter ideas">
                  {FILTERS.map(([f, label]) => (
                    <Chip key={f} pressed={filter === f} onClick={() => setFilter(f)}>
                      {label}
                    </Chip>
                  ))}
                </div>
              </div>
              {visible.length === 0 ? (
                <p className={styles.noneFiltered}>{filter === 'open' ? 'Someone’s getting every idea.' : 'Nobody has claimed an idea yet.'}</p>
              ) : (
                <ul className={listStyles.rows}>
                  {visible.map((idea) => (
                    <IdeaRow
                      key={idea.id}
                      idea={idea}
                      list={list}
                      next={next}
                      isNew={idea.id === newId}
                      busy={busyId === idea.id}
                      onEdit={() => setOverlay({ kind: 'edit', idea })}
                      onPick={(picked) => pick.mutate({ idea, picked })}
                      onClaim={() => claim.mutate({ idea, mine: true })}
                      onUnclaim={() => claim.mutate({ idea, mine: false })}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <aside className={styles.aside} aria-label={`About ${list.title}`}>
          <OccasionsBox list={list} dates={dates} onOpen={(occasion) => setOverlay({ kind: 'occasion', occasion })} />
          {next && <BudgetBox items={list.items} occ={next} onChange={() => setOverlay({ kind: 'occasion', occasion: next })} />}
          <NotesBox
            list={list}
            onSave={async (personNotes) => {
              const saved = await api.updateList(list.id, { personNotes });
              qc.setQueryData(key, saved);
            }}
          />
        </aside>
      </div>

      {overlay?.kind === 'add' && (
        <AddItemDialog
          listId={list.id}
          kind="person"
          targetName={list.title}
          start={overlay.start}
          onClose={() => setOverlay(null)}
          onAdded={(item) => {
            setList((l) => ({ ...l, items: [item as Idea, ...l.items] }));
            setFilter('all');
            setNewId(item.id);
            refreshOverview();
          }}
        />
      )}
      {overlay?.kind === 'edit' && (
        <EditItemDrawer
          item={overlay.idea}
          kind="person"
          listTitle={list.title}
          onClose={() => setOverlay(null)}
          onSaved={(saved) => {
            putIdea(saved as Idea);
            refreshOverview();
          }}
          onRemove={() => remove(overlay.idea)}
        />
      )}
      {overlay?.kind === 'plan' && <PlanTogetherDialog list={list} onClose={() => setOverlay(null)} />}
      {overlay?.kind === 'occasion' && (
        <OccasionDialog
          listId={list.id}
          occasion={overlay.occasion}
          withBudget
          defaultLabel={list.occasions.some((o) => o.label === 'Birthday') ? '' : 'Birthday'}
          onClose={() => setOverlay(null)}
          onSaved={(occasion) => {
            setList((l) => ({
              ...l,
              occasions: l.occasions.some((o) => o.id === occasion.id) ? l.occasions.map((o) => (o.id === occasion.id ? occasion : o)) : [...l.occasions, occasion],
            }));
            refreshOverview();
          }}
          onRemoved={(id) => {
            setList((l) => ({
              ...l,
              occasions: l.occasions.filter((o) => o.id !== id),
              items: l.items.map((i) => (i.pickedFor.includes(id) ? { ...i, pickedFor: i.pickedFor.filter((x) => x !== id) } : i)),
            }));
            refreshOverview();
          }}
        />
      )}
      {overlay?.kind === 'rename' && (
        <PersonNameDialog
          title={list.title}
          fullName={list.personFullName}
          onClose={() => setOverlay(null)}
          onSave={async (patch) => {
            const saved = await api.updateList(list.id, patch);
            qc.setQueryData(key, saved);
            refreshOverview();
          }}
        />
      )}
      {overlay?.kind === 'delete' && (
        <DeleteListDialog
          title={list.title}
          itemCount={list.items.length}
          noun="idea"
          shared={false}
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
      {overlay?.kind === 'leave' && (
        <LeaveDialog
          title={list.title}
          ownerName={firstName(list.owner)}
          onClose={() => setOverlay(null)}
          onLeave={async () => {
            const me = list.members.find((m) => m.user?.isMe);
            if (me) await api.removeMember(me.id);
            qc.removeQueries({ queryKey: key });
            await refreshOverview();
            navigate('/app');
            toast(`You left ${list.title}`);
          }}
        />
      )}
    </>
  );
}

/** Gift ideas for one person · /app/people/:id (SCREENS.md §6). */
export function PersonPage() {
  const id = Number(useParams().id);
  const { data, error, isPending } = useQuery({ queryKey: keys.list(id), queryFn: () => api.list(id), enabled: Number.isInteger(id) && id > 0 });

  if (!Number.isInteger(id) || id <= 0 || (error instanceof ApiError && error.status === 404)) {
    return (
      <Message inline title="We couldn’t find that list" action={<ButtonLink to="/app">Go to your lists</ButtonLink>}>
        It may have been deleted, or you’re no longer planning it.
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
        <Skeleton width="40%" height={40} radius={10} className={listStyles.loadingTitle} />
      </div>
    );
  }
  if (data.kind === 'wish') return <Navigate to={`/app/lists/${data.id}`} replace />;
  return <Person key={data.id} list={data} />;
}
