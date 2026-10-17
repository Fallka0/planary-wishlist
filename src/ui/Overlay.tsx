import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './Button';
import styles from './Overlay.module.css';

// Overlays render into a node inside the app's container (.site), so the container queries that
// turn dialogs into bottom sheets on phones apply to them too.

const OverlayRootContext = createContext<HTMLElement | null>(null);

export function OverlayRoot({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  return (
    <OverlayRootContext.Provider value={node}>
      {children}
      <div ref={setNode} />
    </OverlayRootContext.Provider>
  );
}

function usePortal(children: ReactNode) {
  const root = useContext(OverlayRootContext);
  return createPortal(children, root ?? document.body);
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal behaviour: focus moves in (to `initialFocus` or the first field), Tab stays inside, Esc closes,
 * the page behind doesn't scroll, and focus goes back to whatever opened it.
 */
export function useModal(ref: RefObject<HTMLElement | null>, onClose: () => void, initialFocus?: RefObject<HTMLElement | null>) {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = ref.current;
    if (!el) return;

    const first = initialFocus?.current ?? el.querySelector<HTMLElement>('input, textarea, select') ?? el;
    first.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstItem = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === firstItem || document.activeElement === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        firstItem.focus();
      }
    };
    el.addEventListener('keydown', onKey);

    const html = document.documentElement;
    const overflow = html.style.overflow;
    html.style.overflow = 'hidden';

    return () => {
      el.removeEventListener('keydown', onKey);
      html.style.overflow = overflow;
      if (opener && document.contains(opener)) opener.focus();
    };
    // Runs once per open; initialFocus is read at open time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);
}

interface OverlayProps {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  children?: ReactNode;
  initialFocus?: RefObject<HTMLElement | null>;
}

function Head({ titleId, subtitleId, title, subtitle, onClose }: { titleId: string; subtitleId: string } & Pick<OverlayProps, 'title' | 'subtitle' | 'onClose'>) {
  return (
    <div className={styles.head}>
      <div>
        <h2 className={styles.title} id={titleId}>
          {title}
        </h2>
        {subtitle && (
          <p className={styles.subtitle} id={subtitleId}>
            {subtitle}
          </p>
        )}
      </div>
      <IconButton icon="x" label="Close" className={styles.close} onClick={onClose} />
    </div>
  );
}

/** Centred dialog; a bottom sheet under 760px. Clicking the scrim closes it. */
export function Dialog({ title, subtitle, onClose, footer, children, initialFocus, wide }: OverlayProps & { wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useModal(ref, onClose, initialFocus);
  return usePortal(
    <div
      className={styles.scrim}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={[styles.dlg, wide && styles.wide].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        aria-describedby={subtitle ? `${id}-s` : undefined}
        tabIndex={-1}
      >
        <Head titleId={`${id}-t`} subtitleId={`${id}-s`} title={title} subtitle={subtitle} onClose={onClose} />
        {children && <div className={styles.body}>{children}</div>}
        {footer && <div className={styles.foot}>{footer}</div>}
      </div>
    </div>,
  );
}

/** Right-hand drawer over a light scrim; a bottom sheet under 760px. */
export function Drawer({ title, subtitle, onClose, footer, children, initialFocus }: OverlayProps) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useModal(ref, onClose, initialFocus);
  return usePortal(
    <>
      <div className={`${styles.scrim} ${styles.thin}`} onMouseDown={onClose} aria-hidden="true" />
      <div
        ref={ref}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        aria-describedby={subtitle ? `${id}-s` : undefined}
        tabIndex={-1}
      >
        <Head titleId={`${id}-t`} subtitleId={`${id}-s`} title={title} subtitle={subtitle} onClose={onClose} />
        {children && <div className={styles.body}>{children}</div>}
        {footer && <div className={styles.foot}>{footer}</div>}
      </div>
    </>,
  );
}
