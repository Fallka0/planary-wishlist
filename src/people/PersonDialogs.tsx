import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../lib/api';
import { Button, Dialog, TextField, useToast } from '../ui';
import styles from '../lists/Lists.module.css';

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'That didn’t work. Try again.');

/** Change who a gift idea list is for. Not in the design; same vocabulary as New list. */
export function PersonNameDialog({
  title,
  fullName,
  onClose,
  onSave,
}: {
  title: string;
  fullName: string;
  onClose: () => void;
  onSave: (patch: { title: string; personFullName: string }) => Promise<unknown>;
}) {
  const [name, setName] = useState(title);
  const [full, setFull] = useState(fullName);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const toast = useToast();
  const save = useMutation({
    mutationFn: () => onSave({ title: name.trim(), personFullName: full.trim() }),
    onSuccess: () => {
      onClose();
      toast('Saved');
    },
    onError: (e) => setFormError(errorText(e)),
  });
  return (
    <Dialog
      title="Rename"
      onClose={onClose}
      onSubmit={() => (name.trim() ? save.mutate() : setError('Say who it’s for.'))}
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
        label="Who is it for?"
        placeholder="e.g. Dad, or Sara from work"
        value={name}
        maxLength={60}
        error={error}
        onChange={(e) => {
          setName(e.target.value);
          setError('');
        }}
      />
      <TextField
        label="Full name"
        placeholder="e.g. Andrea Brunner"
        help="Optional. Shown under the name."
        value={full}
        maxLength={80}
        onChange={(e) => setFull(e.target.value)}
      />
      {formError && (
        <p role="alert" className={styles.formError}>
          {formError}
        </p>
      )}
    </Dialog>
  );
}

/** A co-planner leaves a gift idea list. Not in the design; same vocabulary as Delete list. */
export function LeaveDialog({ title, ownerName, onClose, onLeave }: { title: string; ownerName: string; onClose: () => void; onLeave: () => Promise<unknown> }) {
  const [error, setError] = useState('');
  const leave = useMutation({ mutationFn: onLeave, onError: (e) => setError(errorText(e)) });
  return (
    <Dialog
      title={`Leave ${title}?`}
      subtitle={`You won’t see these ideas anymore. ${ownerName} can invite you again.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={leave.isPending} onClick={() => leave.mutate()}>
            Leave list
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
