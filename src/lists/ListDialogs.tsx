import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { daysIn, parsePrice, pluralise } from '../lib/format';
import type { Occasion } from '../lib/types';
import { Button, Dialog, PriceField, SelectField, TextField, useToast } from '../ui';
import styles from './Lists.module.css';

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'That didn’t work. Try again.');

/** Rename a list. Not in the design; same vocabulary as New list. */
export function RenameDialog({ title, onClose, onSave }: { title: string; onClose: () => void; onSave: (title: string) => Promise<unknown> }) {
  const [value, setValue] = useState(title);
  const [error, setError] = useState('');
  const toast = useToast();
  const save = useMutation({
    mutationFn: () => onSave(value.trim()),
    onSuccess: () => {
      onClose();
      toast('Saved');
    },
    onError: (e) => setError(errorText(e)),
  });
  return (
    <Dialog
      title="Rename list"
      onClose={onClose}
      onSubmit={() => (value.trim() ? save.mutate() : setError('Give the list a name.'))}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <TextField
        label="List name"
        value={value}
        maxLength={60}
        error={error}
        onChange={(e) => {
          setValue(e.target.value);
          setError('');
        }}
      />
    </Dialog>
  );
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Add or change a date: a name, month and day, an optional year (empty = every year) and, on
 * person lists, a budget. Not in the design; same vocabulary as the other dialogs.
 */
export function OccasionDialog({
  listId,
  occasion,
  withBudget,
  defaultLabel = 'Birthday',
  onClose,
  onSaved,
  onRemoved,
}: {
  listId: number;
  occasion: Occasion | null;
  withBudget?: boolean;
  defaultLabel?: string;
  onClose: () => void;
  onSaved: (o: Occasion) => void;
  onRemoved: (id: number) => void;
}) {
  const [label, setLabel] = useState(occasion?.label ?? defaultLabel);
  const [month, setMonth] = useState(occasion?.month ?? 1);
  const [day, setDay] = useState(occasion?.day ?? 1);
  const [year, setYear] = useState(occasion?.year ? String(occasion.year) : '');
  const [budget, setBudget] = useState(occasion?.budgetCents ? (occasion.budgetCents / 100).toFixed(2) : '');
  const [errors, setErrors] = useState<{ label?: string; year?: string; budget?: string; form?: string }>({});
  const toast = useToast();

  const yearNum = year.trim() ? Number(year.trim()) : null;
  const maxDay = daysIn(month, yearNum && Number.isInteger(yearNum) ? yearNum : 0);

  const save = useMutation({
    mutationFn: (input: { label: string; month: number; day: number; year: number | null; budgetCents?: number | null }) =>
      occasion ? api.updateOccasion(occasion.id, input) : api.createOccasion(listId, input),
    onSuccess: (o) => {
      onSaved(o);
      onClose();
      toast('Date saved');
    },
    onError: (e) => setErrors({ form: errorText(e) }),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteOccasion(occasion!.id),
    onSuccess: () => {
      onRemoved(occasion!.id);
      onClose();
      toast('Date removed');
    },
    onError: (e) => setErrors({ form: errorText(e) }),
  });

  const submit = () => {
    const found: typeof errors = {};
    if (!label.trim()) found.label = 'Name the date, like Birthday.';
    if (yearNum !== null && (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100)) found.year = 'Use a year like 2027, or leave it empty.';
    const cents = withBudget ? parsePrice(budget) : 0;
    if (cents === null) found.budget = 'Use an amount like 150.';
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    save.mutate({
      label: label.trim(),
      month,
      day: Math.min(day, maxDay),
      year: yearNum,
      ...(withBudget ? { budgetCents: cents || null } : {}),
    });
  };

  return (
    <Dialog
      title={occasion ? 'Change date' : 'Add a date'}
      subtitle="Leave the year empty for a date that comes back every year."
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          {occasion && (
            <Button variant="danger" icon="trash" className="grow" disabled={remove.isPending} onClick={() => remove.mutate()}>
              Remove date
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className={styles.dateRow}>
        <TextField label="What’s the date?" placeholder="e.g. Birthday" value={label} maxLength={40} error={errors.label} onChange={(e) => setLabel(e.target.value)} />
        <SelectField label="Day" value={Math.min(day, maxDay)} onChange={(e) => setDay(Number(e.target.value))}>
          {Array.from({ length: maxDay }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </SelectField>
        <SelectField label="Month" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </SelectField>
      </div>
      <TextField label="Year" inputMode="numeric" placeholder="Every year" value={year} maxLength={4} error={errors.year} onChange={(e) => setYear(e.target.value)} />
      {withBudget && <PriceField label="Budget" placeholder="0.00" value={budget} error={errors.budget} onChange={(e) => setBudget(e.target.value)} />}
      {errors.form && (
        <p role="alert" className={styles.formError}>
          {errors.form}
        </p>
      )}
    </Dialog>
  );
}

/** "Delete <title>? This removes its 9 items and turns off its link." */
export function DeleteListDialog({
  title,
  itemCount,
  shared,
  onClose,
  onDelete,
}: {
  title: string;
  itemCount: number;
  shared: boolean;
  onClose: () => void;
  onDelete: () => Promise<unknown>;
}) {
  const [error, setError] = useState('');
  const del = useMutation({ mutationFn: onDelete, onError: (e) => setError(errorText(e)) });
  const what = itemCount > 0 ? `This removes its ${pluralise(itemCount, 'item')}` : 'This removes the list';
  return (
    <Dialog
      title={`Delete ${title}?`}
      subtitle={`${what}${shared ? ' and turns off its link' : ''}.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" icon="trash" disabled={del.isPending} onClick={() => del.mutate()}>
            Delete list
          </Button>
        </>
      }
    >
      {error && (
        <p role="alert" className={styles.formError}>
          {error}
        </p>
      )}
    </Dialog>
  );
}
