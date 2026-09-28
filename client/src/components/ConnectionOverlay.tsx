import { takeOverSession } from '../socket/connection';
import { useAppState } from '../state/store';
import { Button } from './Button';
import styles from './ConnectionOverlay.module.css';

/** Global connection feedback: a "reconnecting" bar, or a blocking notice when another tab took over. */
export function ConnectionOverlay() {
  const connection = useAppState((s) => s.connection);

  if (connection === 'replaced') {
    return (
      <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="replaced-title">
        <div className={styles.dialog}>
          <h2 id="replaced-title" className={styles.title}>
            Open in another tab
          </h2>
          <p className={styles.body}>You're playing in another tab or window. Only one can be active at a time.</p>
          <Button fullWidth onClick={takeOverSession}>
            Play here instead
          </Button>
        </div>
      </div>
    );
  }

  if (connection === 'reconnecting') {
    return (
      <div className={styles.bar} role="status">
        Connection lost. Reconnecting…
      </div>
    );
  }

  return null;
}
