import type { ReactNode } from 'react';
import { PlanaryMark } from '../ui';
import styles from './Message.module.css';

/**
 * A centred message: title, a line of text and an optional action. On its own page it is the main
 * landmark; inside the app shell (inline) it sits in the shell's main area.
 */
export function Message({ title, children, action, inline }: { title: string; children?: ReactNode; action?: ReactNode; inline?: boolean }) {
  const box = (
    <div className={styles.box}>
      {!inline && <PlanaryMark className={styles.mark} />}
      <h1 className={styles.title}>{title}</h1>
      {children && <p className={styles.lead}>{children}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
  if (inline) return <div className={styles.inline}>{box}</div>;
  return (
    <main id="main" tabIndex={-1} className={styles.wrap}>
      {box}
    </main>
  );
}
