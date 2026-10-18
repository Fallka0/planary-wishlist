import { useState } from 'react';
import { formatMoney } from '../lib/format';
import type { PublicItem } from '../lib/types';
import { Button, Dialog, TextField, Tile } from '../ui';
import styles from './Shared.module.css';

function ItemCard({ item }: { item: PublicItem }) {
  return (
    <div className={styles.resItem}>
      <Tile imageUrl={item.imageUrl} className={styles.resTile} />
      <div>
        <p className={styles.name}>{item.name}</p>
        <p className={styles.sub}>
          {item.store && <span>{item.store}</span>}
          <span>{formatMoney(item.priceCents, item.currency)}</span>
        </p>
      </div>
    </div>
  );
}

/** Reserve without an account (SCREENS.md §8c). The undo link goes to the email; the owner never sees it. */
export function ReserveDialog({
  item,
  ownerFirstName,
  pending,
  error,
  onSignIn,
  onClose,
  onReserve,
}: {
  item: PublicItem;
  ownerFirstName: string;
  pending: boolean;
  error: string;
  onSignIn: () => void;
  onClose: () => void;
  onReserve: (email: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  return (
    <Dialog
      title="You’ll get this?"
      subtitle={`It shows as taken for everyone else. ${ownerFirstName} won’t see that it’s reserved, or by whom.`}
      onClose={onClose}
      onSubmit={() => {
        const value = email.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) setEmailError('Enter your email, like name@example.ch.');
        else onReserve(value);
      }}
      footer={
        <>
          <p className={['grow', styles.signIn].join(' ')}>
            Have a Planary account?{' '}
            <button type="button" className={styles.linkBtn} onClick={onSignIn}>
              Sign in
            </button>
          </p>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            Reserve
          </Button>
        </>
      }
    >
      <ItemCard item={item} />
      <TextField
        label="Your email"
        type="email"
        autoComplete="email"
        placeholder="name@example.ch"
        value={email}
        error={emailError || error}
        help={`We send you a link to undo this if plans change. ${ownerFirstName} never sees it.`}
        onChange={(e) => {
          setEmail(e.target.value);
          setEmailError('');
        }}
      />
    </Dialog>
  );
}

/**
 * Opened from the undo link in the reservation email. It asks first, because mail scanners open
 * links on their own. Not in the design; same vocabulary as the reserve dialog.
 */
export function UndoDialog({ item, pending, onClose, onUndo }: { item: PublicItem; pending: boolean; onClose: () => void; onUndo: () => void }) {
  return (
    <Dialog
      title="Not getting this after all?"
      subtitle="Undo it and it shows as free again for everyone else."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep it
          </Button>
          <Button disabled={pending} onClick={onUndo}>
            Undo reservation
          </Button>
        </>
      }
    >
      <ItemCard item={item} />
    </Dialog>
  );
}
