import { Fragment, type ReactNode } from 'react';
import { formatMoney, parsePrice } from '../lib/format';
import type { Priority } from '../lib/types';
import { FieldGroup, FieldPair, Icon, PriceField, Segmented, Skeleton, TextArea, TextField, Tile } from '../ui';
import styles from './Items.module.css';

export const PRIORITY_LABEL: Record<Priority, string> = { 1: 'Must have', 2: 'Would love', 3: 'Nice to have' };
const PRIORITY_OPTIONS = ([1, 2, 3] as Priority[]).map((value) => ({ value, label: PRIORITY_LABEL[value] }));

/** What the form edits. Price stays text until saving, so "179,90" survives typing. */
export interface Draft {
  name: string;
  price: string;
  currency: string;
  priority: Priority;
  note: string;
  url: string;
  imageUrl: string;
  store: string;
}

export const emptyDraft = (): Draft => ({ name: '', price: '', currency: 'CHF', priority: 2, note: '', url: '', imageUrl: '', store: '' });

/** "179.00" for the price field. */
export function priceText(cents: number): string {
  return cents ? (cents / 100).toFixed(2) : '';
}

export interface DraftErrors {
  name?: string;
  price?: string;
}

/** Checks the draft before saving. Messages are the UI copy. */
export function validateDraft(d: Draft): { errors: DraftErrors; priceCents: number } {
  const errors: DraftErrors = {};
  if (!d.name.trim()) errors.name = 'Give it a name so you recognise it later.';
  const cents = parsePrice(d.price);
  if (cents === null) errors.price = 'Use a price like 179 or 179.90.';
  return { errors, priceCents: cents ?? 0 };
}

/** Tile, shop and name/price, as at the top of the filled Add dialog and the Edit drawer. */
export function PreviewCard({ draft, children }: { draft: Draft; children?: ReactNode }) {
  const cents = parsePrice(draft.price) ?? 0;
  return (
    <div className={styles.pv}>
      <Tile imageUrl={draft.imageUrl} className={styles.pvTile} />
      <div>
        <p className={styles.pvSource}>
          <Icon name="globe" small />
          {draft.store || 'Added by hand'}
        </p>
        {children ?? (
          <>
            {draft.name.trim() && <p className={styles.pvName}>{draft.name}</p>}
            <p className={styles.pvPrice}>{formatMoney(cents, draft.currency)}</p>
          </>
        )}
      </div>
    </div>
  );
}

export function PreviewSkeleton() {
  return (
    <div className={styles.pv} aria-hidden="true">
      <Skeleton className={styles.pvTile} />
      <span className={styles.skLines}>
        <Skeleton width="40%" height={12} />
        <Skeleton width="88%" height={16} />
        <Skeleton width="64%" height={16} />
        <Skeleton width="28%" height={14} />
      </span>
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p className={`${styles.note} ${styles.err}`} role="alert">
      <Icon name="alert" />
      <span>{children}</span>
    </p>
  );
}

/**
 * Name, price and priority, and a note for whoever buys it. Ideas on person lists have no priority
 * or note; they show the shop instead.
 */
export function ItemFields({
  draft,
  onChange,
  errors,
  kind,
  autoFocus,
  stacked,
}: {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  errors: DraftErrors;
  kind: 'wish' | 'person';
  /** Move focus to the name when the form replaces something else in the dialog. */
  autoFocus?: boolean;
  /** One field per row, for the narrow drawer. */
  stacked?: boolean;
}) {
  const Pair = stacked ? Fragment : FieldPair;
  const price = (
    <PriceField
      label="Price"
      currency={draft.currency}
      placeholder="0.00"
      value={draft.price}
      error={errors.price}
      onChange={(e) => onChange({ price: e.target.value })}
    />
  );
  return (
    <>
      <TextField
        label="Name"
        autoFocus={autoFocus}
        placeholder="What is it?"
        value={draft.name}
        maxLength={200}
        error={errors.name}
        onChange={(e) => onChange({ name: e.target.value })}
      />
      {kind === 'wish' ? (
        <>
          <Pair>
            {price}
            <FieldGroup label="Priority">
              {(id) => <Segmented labelledBy={id} options={PRIORITY_OPTIONS} value={draft.priority} onChange={(priority) => onChange({ priority })} />}
            </FieldGroup>
          </Pair>
          <TextArea
            label={
              <>
                Note <em>for whoever buys it</em>
              </>
            }
            placeholder="Colour, size, or which version"
            value={draft.note}
            maxLength={500}
            onChange={(e) => onChange({ note: e.target.value })}
          />
        </>
      ) : (
        <Pair>
          {price}
          <TextField label="Shop" value={draft.store || 'No shop yet'} readOnly />
        </Pair>
      )}
    </>
  );
}
