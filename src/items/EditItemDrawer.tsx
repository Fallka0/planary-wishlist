import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { Idea, WishItem } from '../lib/types';
import { Button, Drawer, useToast } from '../ui';
import { ItemFields, PreviewCard, priceText, validateDraft, type Draft, type DraftErrors } from './ItemForm';
import styles from './Items.module.css';

/** Edit item (SCREENS.md §4): a right-hand drawer. Remove has no confirm; the list offers Undo. */
export function EditItemDrawer({
  item,
  kind,
  listTitle,
  onClose,
  onSaved,
  onRemove,
}: {
  item: WishItem | Idea;
  kind: 'wish' | 'person';
  listTitle: string;
  onClose: () => void;
  onSaved: (item: WishItem | Idea) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState<Draft>({
    name: item.name,
    price: priceText(item.priceCents),
    currency: item.currency,
    priority: 'priority' in item ? item.priority : 2,
    note: item.note,
    url: item.url,
    imageUrl: item.imageUrl,
    store: item.store,
  });
  const [errors, setErrors] = useState<DraftErrors>({});
  const toast = useToast();

  const save = useMutation({
    mutationFn: (priceCents: number) =>
      api.updateItem(item.id, {
        name: draft.name.trim(),
        priceCents,
        ...(kind === 'wish' ? { priority: draft.priority, note: draft.note.trim() } : {}),
      }),
    onSuccess: (saved) => {
      onSaved(saved);
      onClose();
      toast('Saved');
    },
    onError: (e) => setErrors({ name: e instanceof ApiError ? e.message : 'That didn’t work. Try again.' }),
  });

  return (
    <Drawer
      title="Edit item"
      subtitle={`On ${listTitle}`}
      onClose={onClose}
      onSubmit={() => {
        const { errors: found, priceCents } = validateDraft(draft);
        setErrors(found);
        if (!found.name && !found.price) save.mutate(priceCents);
      }}
      footer={
        <>
          <Button variant="danger" icon="trash" className="grow" onClick={onRemove}>
            Remove
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <PreviewCard draft={draft}>
        {item.url && (
          <p className={styles.pvPrice}>
            <a className="ul" href={item.url} target="_blank" rel="noopener noreferrer">
              Open in shop
            </a>
          </p>
        )}
      </PreviewCard>
      <ItemFields stacked kind={kind} draft={draft} errors={errors} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
    </Drawer>
  );
}
