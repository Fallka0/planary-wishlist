import type { ReactNode } from 'react';
import { MarkDefs, OverlayRoot, ToastProvider } from '../ui';
import styles from './Frame.module.css';

/** Ink frame, paper surface, skip link and the places overlays and toasts render into. */
export function Frame({ children }: { children: ReactNode }) {
  return (
    <div className={styles.frame}>
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <div className={styles.site}>
        <MarkDefs />
        <ToastProvider>
          <OverlayRoot>{children}</OverlayRoot>
        </ToastProvider>
      </div>
    </div>
  );
}
