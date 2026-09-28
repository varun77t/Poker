import type { ReactNode } from 'react';
import { Link } from 'react-router';
import styles from './Layout.module.css';

/** Page shell: a single centered column that works from 320px phones up. */
export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <main className={[styles.page, wide && styles.wide].filter(Boolean).join(' ')}>{children}</main>;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={[styles.card, className].filter(Boolean).join(' ')}>{children}</section>;
}

/** Brand mark + name. Large on the landing page, compact (and linking home) elsewhere. */
export function Brand({ size = 'small' }: { size?: 'large' | 'small' }) {
  if (size === 'large') {
    return (
      <header className={styles.brandLarge}>
        <span className={styles.markLarge} aria-hidden="true">
          ♠
        </span>
        <h1 className={styles.title}>Private Hold'em</h1>
        <p className={styles.tagline}>Texas Hold'em with friends. Virtual chips only.</p>
      </header>
    );
  }
  return (
    <Link to="/" className={styles.brandSmall}>
      <span className={styles.markSmall} aria-hidden="true">
        ♠
      </span>
      Private Hold'em
    </Link>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error'; children: ReactNode }) {
  return (
    <p className={tone === 'error' ? styles.noticeError : styles.noticeInfo} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
