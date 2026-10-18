import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { Icon, type IconName } from './Icon';
import styles from './Controls.module.css';

/** A filter chip: a toggle button with aria-pressed. */
export function Chip({ pressed, children, ...rest }: { pressed: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={styles.chip} aria-pressed={pressed} {...rest}>
      {children}
    </button>
  );
}

export interface SegmentOption<T> {
  value: T;
  label: string;
  icon?: IconName;
}

/**
 * Pick one of a few options. With icons it's the compact rows/grid toggle (labels go to aria-label);
 * without, it's the full-width text control used for priority in forms.
 */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  labelledBy,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
  labelledBy?: string;
}) {
  const icons = options.every((o) => o.icon);
  return (
    <div className={icons ? styles.seg : styles.segText} role="group" aria-label={label} aria-labelledby={labelledBy}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          aria-label={icons ? o.label : undefined}
          title={icons ? o.label : undefined}
          onClick={() => onChange(o.value)}
        >
          {icons && o.icon ? <Icon name={o.icon} /> : o.label}
        </button>
      ))}
    </div>
  );
}

/** On/off switch. Give it a label (or aria-labelledby) that says what it switches. */
export function Switch({
  checked,
  onChange,
  ...rest
}: { checked: boolean; onChange: (checked: boolean) => void; ref?: Ref<HTMLButtonElement> } & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange'
>) {
  return <button type="button" role="switch" aria-checked={checked} className={styles.sw} onClick={() => onChange(!checked)} {...rest} />;
}
