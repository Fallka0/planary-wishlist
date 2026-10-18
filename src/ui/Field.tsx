import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import styles from './Field.module.css';

interface FieldProps {
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
}

function useFieldIds(error?: ReactNode, help?: ReactNode) {
  const id = useId();
  const describedBy = [error && `${id}-e`, help && `${id}-h`].filter(Boolean).join(' ') || undefined;
  return { id, describedBy };
}

function Messages({ id, help, error }: { id: string; help?: ReactNode; error?: ReactNode }) {
  return (
    <>
      {error && (
        <p className={styles.error} id={`${id}-e`} role="alert">
          {error}
        </p>
      )}
      {help && (
        <p className={styles.help} id={`${id}-h`}>
          {help}
        </p>
      )}
    </>
  );
}

/** Labelled text input with optional help text and an error. */
export function TextField({ label, help, error, className, ...input }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const { id, describedBy } = useFieldIds(error, help);
  return (
    <div className={[styles.f, className].filter(Boolean).join(' ')}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input id={id} className={styles.inp} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
      <Messages id={id} help={help} error={error} />
    </div>
  );
}

export function TextArea({ label, help, error, className, ...input }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { id, describedBy } = useFieldIds(error, help);
  return (
    <div className={[styles.f, className].filter(Boolean).join(' ')}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <textarea id={id} className={styles.inp} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
      <Messages id={id} help={help} error={error} />
    </div>
  );
}

/**
 * Price with the currency inside the field. Takes and gives the raw text; parse it with
 * parsePrice() from lib/format, which accepts "179", "179.00" and "179,90".
 */
export function PriceField({
  label,
  help,
  error,
  currency = 'CHF',
  className,
  ...input
}: FieldProps & { currency?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const { id, describedBy } = useFieldIds(error, help);
  return (
    <div className={[styles.f, className].filter(Boolean).join(' ')}>
      <label className={styles.label} htmlFor={id}>
        {label}
        <span className="sr-only"> in {currency}</span>
      </label>
      <div className={styles.box}>
        <span className={styles.prefix} aria-hidden="true">
          {currency}
        </span>
        <input
          id={id}
          className={`${styles.inp} ${styles.withPrefix}`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...input}
        />
      </div>
      <Messages id={id} help={help} error={error} />
    </div>
  );
}
