import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { Idea, WishItem } from '../lib/types';
import { Button, Dialog, Icon, TextField, useToast } from '../ui';
import { emptyDraft, ErrorNote, ItemFields, PreviewCard, PreviewSkeleton, priceText, validateDraft, type Draft, type DraftErrors } from './ItemForm';
import styles from './Items.module.css';

export type AddStep = 'paste' | 'reading' | 'filled' | 'failed' | 'manual';

export interface AddStart {
  step: 'paste' | 'reading' | 'manual';
  url?: string;
  name?: string;
}

/** Shop name from a link, for "Reading galaxus.ch…" before the API answers. */
export function hostOf(raw: string): string {
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./, '') || raw;
  } catch {
    return raw;
  }
}

/** Does the quick-add text look like a link rather than a name? */
export function looksLikeUrl(text: string): boolean {
  const t = text.trim();
  return /^https?:\/\/\S+$/i.test(t) || /^(www\.)?[\w-]+(\.[\w-]+)+\/\S*$/i.test(t) || /^www\.[\w-]+(\.[\w-]+)+$/i.test(t);
}

const SUBTITLES: Record<AddStep, string> = {
  paste: 'Paste a link from any online shop.',
  reading: 'Getting the details. This takes a second.',
  filled: 'Check the details, then add it.',
  failed: 'The link is saved, the rest is up to you.',
  manual: 'No link needed. Just say what it is.',
};

/**
 * Add by link (SCREENS.md §3): paste → reading → filled, or failed when the shop can't be read,
 * or manual without a link. Reading calls the link preview; Cancel aborts it.
 */
export function AddItemDialog({
  listId,
  kind,
  targetName,
  start,
  onClose,
  onAdded,
}: {
  listId: number;
  kind: 'wish' | 'person';
  /** "Birthday", or the person's name on a person list. */
  targetName: string;
  start: AddStart;
  onClose: () => void;
  onAdded: (item: WishItem | Idea) => void;
}) {
  const [step, setStep] = useState<AddStep>(start.step);
  const [url, setUrl] = useState(start.url ?? '');
  const [urlError, setUrlError] = useState('');
  const [draft, setDraft] = useState<Draft>(() => ({ ...emptyDraft(), name: start.name ?? '' }));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [failedStore, setFailedStore] = useState('');
  const reading = useRef<AbortController | null>(null);
  const toast = useToast();

  const read = async (link: string) => {
    const trimmed = link.trim();
    if (!trimmed) {
      setUrlError('Paste a link first.');
      return;
    }
    setUrl(trimmed);
    setStep('reading');
    reading.current?.abort();
    const ctrl = new AbortController();
    reading.current = ctrl;
    try {
      const p = await api.linkPreview(trimmed, ctrl.signal);
      setDraft({ ...emptyDraft(), name: p.title, price: priceText(p.priceCents), currency: p.currency, url: p.url, imageUrl: p.imageUrl, store: p.store });
      setErrors({});
      setStep('filled');
    } catch (e) {
      if (ctrl.signal.aborted) return;
      if (e instanceof ApiError && e.code === 'invalid') {
        setUrlError('That doesn’t look like a link. Check it, or add the item without one.');
        setStep('paste');
        return;
      }
      // Unreadable shop, or the preview failed: keep the link and let them fill in the rest.
      const store = (e instanceof ApiError && e.store) || hostOf(trimmed);
      setFailedStore(store);
      setDraft({ ...emptyDraft(), url: trimmed, store });
      setErrors({});
      setStep('failed');
    }
  };

  useEffect(() => {
    if (start.step === 'reading' && start.url) void read(start.url);
    return () => reading.current?.abort();
    // Only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useMutation({
    mutationFn: (priceCents: number) =>
      api.createItem(listId, {
        name: draft.name.trim(),
        url: draft.url,
        imageUrl: draft.imageUrl,
        store: draft.store,
        priceCents,
        currency: draft.currency,
        ...(kind === 'wish' ? { priority: draft.priority, note: draft.note.trim() } : {}),
      }),
    onSuccess: (item) => {
      onAdded(item);
      onClose();
      toast(kind === 'wish' ? `Added to ${targetName}` : `Added to ideas for ${targetName}`);
    },
    onError: (e) => setErrors({ name: e instanceof ApiError ? e.message : 'That didn’t work. Try again.' }),
  });

  const close = () => {
    reading.current?.abort();
    onClose();
  };
  const title = kind === 'wish' ? `Add to ${targetName}` : `Add an idea for ${targetName}`;
  const cta = kind === 'wish' ? `Add to ${targetName}` : 'Add idea';

  const submitForm = () => {
    const { errors: found, priceCents } = validateDraft(draft);
    setErrors(found);
    if (!found.name && !found.price) save.mutate(priceCents);
  };

  const footer =
    step === 'paste' ? (
      <>
        <Button
          variant="ghost"
          className="grow"
          onClick={() => {
            setDraft(emptyDraft());
            setErrors({});
            setStep('manual');
          }}
        >
          Add without a link
        </Button>
        <Button type="submit">Get details</Button>
      </>
    ) : (
      <>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        {step === 'reading' ? (
          <Button disabled>Add item</Button>
        ) : (
          <Button type="submit" disabled={save.isPending}>
            {cta}
          </Button>
        )}
      </>
    );

  // One dialog for every step, so it doesn't pop in again when the step changes.
  return (
    <Dialog
      title={title}
      subtitle={SUBTITLES[step]}
      onClose={close}
      onSubmit={step === 'paste' ? () => void read(url) : step === 'reading' ? undefined : submitForm}
      footer={footer}
    >
      {step === 'paste' && (
        <TextField
          label="Product link"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={url}
          error={urlError}
          help="Works with most shops, like Galaxus, Digitec, Zalando, Manor and IKEA. We read the name, picture and price for you."
          onChange={(e) => {
            setUrl(e.target.value);
            setUrlError('');
          }}
        />
      )}
      {step === 'reading' && (
        <>
          <p className={styles.url}>
            <Icon name="link" small />
            <span>{url}</span>
          </p>
          <PreviewSkeleton />
          <p className={styles.status} role="status">
            <span className={styles.spin} aria-hidden="true" />
            Reading {hostOf(url)}…
          </p>
        </>
      )}
      {step === 'filled' && <PreviewCard draft={draft} />}
      {step === 'failed' && (
        <ErrorNote>We couldn’t read details from {failedStore}. Fill them in yourself, the link is saved with the item.</ErrorNote>
      )}
      {(step === 'filled' || step === 'failed' || step === 'manual') && (
        <ItemFields autoFocus kind={kind} draft={draft} errors={errors} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
      )}
    </Dialog>
  );
}
