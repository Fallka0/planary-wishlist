import type { ReactNode } from 'react';
import { PlanaryMark } from '../ui';
import styles from './Message.module.css';

/** A centred message on its own page: title, a line of text and an optional action. */
export function Message({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className={styles.wrap}>
      <div className={styles.box}>
        <PlanaryMark className={styles.mark} />
        <h1 className={styles.title}>{title}</h1>
        {children && <p className={styles.lead}>{children}</p>}
        {action && <div className={styles.action}>{action}</div>}
      </div>
    </main>
  );
}
