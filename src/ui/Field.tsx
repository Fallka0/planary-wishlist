import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
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

/**
 * Labelled text input with optional help text and an error. An addon (a button) sits next to the
 * input, with the help and error below both.
 */
export function TextField({ label, help, error, addon, className, ...input }: FieldProps & { addon?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const { id, describedBy } = useFieldIds(error, help);
  const field = <input id={id} className={styles.inp} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />;
  return (
    <div className={[styles.f, className].filter(Boolean).join(' ')}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {addon ? (
        <div className={styles.withAddon}>
          {field}
          {addon}
        </div>
      ) : (
        field
      )}
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

/** Labelled native select, styled like the text fields. */
export function SelectField({ label, help, error, className, children, ...select }: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const { id, describedBy } = useFieldIds(error, help);
  return (
    <div className={[styles.f, className].filter(Boolean).join(' ')}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.box}>
        <select id={id} className={`${styles.inp} ${styles.select}`} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...select}>
          {children}
        </select>
        <svg className={styles.chev} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
      <Messages id={id} help={help} error={error} />
    </div>
  );
}

/** Two fields side by side; stacked on phones. */
export function FieldPair({ children }: { children: ReactNode }) {
  return <div className={styles.pair}>{children}</div>;
}

/** A label above any control that isn't a plain input (the priority segments). */
export function FieldGroup({ label, children }: { label: ReactNode; children: (labelId: string) => ReactNode }) {
  const id = useId();
  return (
    <div className={styles.f}>
      <span className={styles.label} id={id}>
        {label}
      </span>
      {children(id)}
    </div>
  );
}
