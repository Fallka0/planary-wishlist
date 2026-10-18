import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { keys } from '../lib/queryClient';
import type { ListKind } from '../lib/types';
import { Button, Dialog, TextField, useToast } from '../ui';
import { UI_ICONS } from '../ui/icons';
import styles from './NewList.module.css';

export const listPath = (kind: ListKind, id: number) => (kind === 'wish' ? `/app/lists/${id}` : `/app/people/${id}`);

/** The two kinds of list as large cards: on the first-run screen and in the New list dialog. */
export function KindChoice({
  kind,
  pressed,
  small,
  withTile,
  onClick,
}: {
  kind: ListKind;
  pressed?: boolean;
  small?: boolean;
  withTile?: boolean;
  onClick: () => void;
}) {
  const wish = kind === 'wish';
  const sub = small
    ? wish
      ? 'A wishlist to share.'
      : 'Private, or planned together.'
    : wish
      ? 'A wishlist you can share when someone asks what you’d like.'
      : 'Collect ideas for one person, with dates, a budget and notes. Plan alone or together.';
  return (
    <button type="button" className={[styles.choice, small && styles.choiceSmall].filter(Boolean).join(' ')} aria-pressed={pressed} onClick={onClick}>
      {withTile && (
        <span className={styles.choiceTile} aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d={wish ? UI_ICONS.gift : UI_ICONS.person} />
          </svg>
        </span>
      )}
      <span className={styles.choiceTitle}>{wish ? 'Things I want' : 'Gift ideas for someone'}</span>
      <span className={styles.choiceSub}>{sub}</span>
    </button>
  );
}

export function ChoiceGrid({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className={styles.choices} role={label ? 'group' : undefined} aria-label={label}>
      {children}
    </div>
  );
}

function NewListDialog({ initialKind, onClose }: { initialKind: ListKind; onClose: () => void }) {
  const [kind, setKind] = useState<ListKind>(initialKind);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: () => api.createList(kind, name),
    onSuccess: (list) => {
      qc.setQueryData(keys.list(list.id), list);
      qc.invalidateQueries({ queryKey: keys.overview });
      onClose();
      navigate(listPath(list.kind, list.id));
      toast('List created');
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'That didn’t work. Try again.'),
  });

  return (
    <Dialog
      title="New list"
      wide
      onClose={onClose}
      onSubmit={() => {
        if (!name.trim()) {
          setError(kind === 'wish' ? 'Give the list a name.' : 'Say who it’s for.');
          return;
        }
        create.mutate();
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            Create list
          </Button>
        </>
      }
    >
      <ChoiceGrid label="Kind of list">
        <KindChoice kind="wish" small pressed={kind === 'wish'} onClick={() => setKind('wish')} />
        <KindChoice kind="person" small pressed={kind === 'person'} onClick={() => setKind('person')} />
      </ChoiceGrid>
      <TextField
        label={kind === 'wish' ? 'List name' : 'Who is it for?'}
        placeholder={kind === 'wish' ? 'e.g. Ski season' : 'e.g. Dad, or Sara from work'}
        value={name}
        maxLength={60}
        error={error}
        onChange={(e) => {
          setName(e.target.value);
          setError('');
        }}
      />
    </Dialog>
  );
}

type OpenNewList = (kind?: ListKind) => void;
const NewListContext = createContext<OpenNewList>(() => {});

/** Lets the sidebar, the overview and the first-run screen open the New list dialog. */
export function NewListProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<ListKind | null>(null);
  const openNew = useCallback<OpenNewList>((kind = 'wish') => setOpen(kind), []);
  return (
    <NewListContext.Provider value={openNew}>
      {children}
      {open && <NewListDialog initialKind={open} onClose={() => setOpen(null)} />}
    </NewListContext.Provider>
  );
}

export function useNewList(): OpenNewList {
  return useContext(NewListContext);
}
