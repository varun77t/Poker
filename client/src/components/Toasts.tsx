import { useAppState } from '../state/store';
import { dismissToast, useToasts } from '../state/toasts';
import styles from './Toasts.module.css';

/**
 * The notices at the top of every screen, centred in the bar: the "reconnecting" banner while the
 * connection is down, then errors from requests the server turned down (an action that arrived
 * late, a rebuy or start that failed). Form mistakes stay inline next to their field instead.
 */
export function Toasts() {
  const toasts = useToasts();
  const reconnecting = useAppState((s) => s.connection === 'reconnecting');
  const seated = useAppState((s) => s.snapshot !== null);

  return (
    <div className={styles.stack}>
      {reconnecting && (
        <div className={styles.banner} role="status">
          <span className={styles.dots} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          Connection lost. Reconnecting
          {seated && <span className={styles.aside}>Your seat is kept while you're away.</span>}
        </div>
      )}
      <div className={styles.toasts} role="alert" aria-live="assertive">
        {toasts.map((t) => (
          <div key={t.id} className={styles.toast}>
            <p>{t.message}</p>
            <button type="button" className={styles.close} onClick={() => dismissToast(t.id)}>
              Dismiss
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
