import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { api } from '../lib/api';
import { copyText } from '../lib/clipboard';
import { keys } from '../lib/queryClient';
import type { ShareState, WishListDetail } from '../lib/types';
import { Button, Dialog, Icon, Switch, TextField, useToast } from '../ui';
import styles from './Lists.module.css';

/** Share a wishlist by link (SCREENS.md §5). */
export function ShareDialog({ list, onClose }: { list: WishListDetail; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const labelId = useId();
  const switchRef = useRef<HTMLButtonElement>(null);

  const apply = (share: ShareState) => {
    qc.setQueryData<WishListDetail>(keys.list(list.id), (l) => (l ? { ...l, share } : l));
    qc.invalidateQueries({ queryKey: keys.overview });
    setCopied(false);
  };
  const toggle = useMutation({ mutationFn: (enabled: boolean) => api.setSharing(list.id, enabled), onSuccess: apply });
  const rotate = useMutation({
    mutationFn: () => api.rotateShare(list.id),
    onSuccess: (share) => {
      apply(share);
      toast('New link made. The old one no longer works.');
    },
  });

  const on = list.share.enabled;
  return (
    <Dialog
      title={`Share ${list.title}`}
      subtitle="Send the link to whoever asks what you’d like."
      onClose={onClose}
      initialFocus={switchRef}
      footer={
        <>
          <Button variant="ghost" className="grow" disabled={rotate.isPending} onClick={() => rotate.mutate()}>
            Make a new link
          </Button>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      <div className={styles.swRow}>
        <div>
          <p className={styles.swTitle} id={labelId}>
            Share by link
          </p>
          <p className={styles.swSub}>{on ? 'On. Anyone with the link can open it.' : list.org ? 'Off. Only your team can see this list.' : 'Off. Only you can see this list.'}</p>
        </div>
        <Switch ref={switchRef} checked={on} aria-labelledby={labelId} disabled={toggle.isPending} onChange={(v) => toggle.mutate(v)} />
      </div>
      {on && list.share.url && (
        <div className={styles.copy}>
          <TextField label="Link" value={withoutScheme(list.share.url)} readOnly onFocus={(e) => e.target.select()} />
          <Button
            icon={copied ? 'check' : 'copy'}
            onClick={async () => {
              if (await copyText(list.share.url ?? '')) setCopied(true);
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      )}
      <ul className={styles.facts}>
        <li>
          <Icon name="globe" />
          <span>Anyone with the link can see the list and reserve items. They don’t need an account.</span>
        </li>
        <li>
          <Icon name="eyeOff" />
          <span>You never see what’s reserved, or by whom. Friends see it, so nobody buys the same thing twice.</span>
        </li>
      </ul>
    </Dialog>
  );
}

/** "planary.ch/w/…": the field shows the link the way people say it; Copy still copies the full URL. */
function withoutScheme(url: string): string {
  return url.replace(/^https?:\/\//, '');
}
