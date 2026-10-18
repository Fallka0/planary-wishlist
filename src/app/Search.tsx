import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { keys } from '../lib/queryClient';
import type { ListKind, SearchResponse } from '../lib/types';
import { Dialog, Icon } from '../ui';
import styles from './Search.module.css';

const listPath = (kind: ListKind, id: number) => (kind === 'wish' ? `/app/lists/${id}` : `/app/people/${id}`);

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

function useSearch(text: string) {
  const q = useDebounced(text.trim(), 200);
  return useQuery({
    queryKey: keys.search(q),
    queryFn: ({ signal }) => api.search(q, signal),
    enabled: q.length >= 2,
    staleTime: 10_000,
  });
}

function firstPath(res?: SearchResponse) {
  if (!res) return null;
  if (res.lists[0]) return listPath(res.lists[0].kind, res.lists[0].id);
  if (res.items[0]) return listPath(res.items[0].listKind, res.items[0].listId);
  return null;
}

/** Grouped results: "Lists" and "Ideas". The first one is highlighted because Enter opens it. */
function Results({ id, res, onPick }: { id: string; res: SearchResponse; onPick: () => void }) {
  const total = res.lists.length + res.items.length;
  return (
    <div id={id}>
      <p className="sr-only" role="status">
        {total === 0 ? 'Nothing found' : `${total} results`}
      </p>
      {total === 0 && <p className={styles.empty}>Nothing found.</p>}
      {res.lists.length > 0 && (
        <div className={styles.group}>
          <p className={styles.groupHead}>Lists</p>
          {res.lists.map((l, i) => (
            <Link key={`l${l.id}`} className={[styles.result, i === 0 && styles.first].filter(Boolean).join(' ')} to={listPath(l.kind, l.id)} onClick={onPick}>
              {l.title}
              <span>{l.kind === 'wish' ? 'Wishlist' : 'Gift ideas'}</span>
            </Link>
          ))}
        </div>
      )}
      {res.items.length > 0 && (
        <div className={styles.group}>
          <p className={styles.groupHead}>Ideas</p>
          {res.items.map((it, i) => (
            <Link
              key={`i${it.id}`}
              className={[styles.result, res.lists.length === 0 && i === 0 && styles.first].filter(Boolean).join(' ')}
              to={listPath(it.listKind, it.listId)}
              onClick={onPick}
            >
              {it.name}
              <span>{it.listTitle}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Search lists and ideas" in the top bar. Enter opens the first result, Esc closes. */
export function SearchBox() {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const { data } = useSearch(text);
  const navigate = useNavigate();
  const id = useId();
  const showing = open && text.trim().length >= 2 && data;

  const reset = () => {
    setText('');
    setOpen(false);
  };

  return (
    <form
      className={styles.search}
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const path = firstPath(data);
        if (path) {
          navigate(path);
          reset();
          (document.activeElement as HTMLElement | null)?.blur();
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      <Icon name="search" className={styles.icon} />
      <input
        className={styles.input}
        type="search"
        aria-label="Search lists and ideas"
        placeholder="Search lists and ideas"
        value={text}
        aria-controls={showing ? id : undefined}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {showing && (
        <div className={styles.pop}>
          <Results id={id} res={data} onPick={reset} />
        </div>
      )}
    </form>
  );
}

/** Phones: the search icon opens this sheet. */
export function SearchSheet({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const { data } = useSearch(text);
  const navigate = useNavigate();
  const id = useId();
  return (
    <Dialog title="Search" onClose={onClose}>
      <form
        role="search"
        className={`${styles.search} ${styles.sheet}`}
        onSubmit={(e) => {
          e.preventDefault();
          const path = firstPath(data);
          if (path) {
            onClose();
            navigate(path);
          }
        }}
      >
        <Icon name="search" className={styles.icon} />
        <input
          className={styles.input}
          type="search"
          aria-label="Search lists and ideas"
          placeholder="Search lists and ideas"
          value={text}
          aria-controls={id}
          onChange={(e) => setText(e.target.value)}
        />
      </form>
      {text.trim().length >= 2 && data && (
        <div className={styles.inline}>
          <Results id={id} res={data} onPick={onClose} />
        </div>
      )}
    </Dialog>
  );
}
