import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type SelectHTMLAttributes } from 'react';
import { IconButton } from './Button';
import { Icon, type IconName } from './Icon';
import styles from './Menu.module.css';

export interface MenuItem {
  label: string;
  icon?: IconName;
  danger?: boolean;
  onSelect: () => void;
}

/**
 * An icon button that opens a small menu. Arrow keys move, Esc closes and returns focus,
 * clicking elsewhere closes it.
 */
export function MenuButton({ label, icon = 'more', items }: { label: string; icon?: IconName; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const el = wrap.current;
    el?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    const onDown = (e: MouseEvent) => {
      if (el && !el.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    wrap.current?.querySelector<HTMLElement>('button')?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const all = [...(wrap.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])];
    const i = all.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      all[(i + 1) % all.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      all[(i - 1 + all.length) % all.length]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className={styles.wrap} ref={wrap} onKeyDown={open ? onKeyDown : undefined}>
      <IconButton icon={icon} label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((v) => !v)} />
      {open && (
        <div className={styles.menu} role="menu" id={id} aria-label={label}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={[styles.item, item.danger && styles.danger].filter(Boolean).join(' ')}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.icon && <Icon name={item.icon} small />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Small pill select with a visually hidden label ("Sort by"). */
export function PillSelect({ label, children, ...rest }: { label: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className={styles.sel}>
      <span className="sr-only">{label}</span>
      <select {...rest}>{children}</select>
      <Icon name="chevronDown" />
    </label>
  );
}
