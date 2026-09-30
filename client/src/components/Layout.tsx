import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cx } from '../lib/cx';
import styles from './Layout.module.css';

/**
 * The pre-game screens (create a room, the invite prompt, loading and problem states): the same
 * 52px strip as the table's bar, with the product name leading home, and the room below it.
 */
export function Shell({ children, actions, className }: { children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <Link to="/" className={styles.mark}>
          Private Hold'em
        </Link>
        <span className={styles.spacer} />
        {actions}
      </header>
      <main className={cx(styles.main, className)}>{children}</main>
    </div>
  );
}

/** A floating plate in the action panel's material. */
export function Panel({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <section className={cx(styles.panel, className)} aria-label={label}>
      {children}
    </section>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error'; children: ReactNode }) {
  return (
    <p className={tone === 'error' ? styles.noticeError : styles.noticeInfo} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
