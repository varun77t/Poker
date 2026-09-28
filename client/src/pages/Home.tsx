import { useConnection, type ConnectionStatus } from '../hooks/useConnection';
import { useServerHealth } from '../hooks/useServerHealth';
import styles from './Home.module.css';

const STATUS_TEXT: Record<ConnectionStatus, string> = {
  connecting: 'Connecting…',
  connected: 'Connected',
  disconnected: 'Disconnected',
};

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function Home() {
  const { status, latencyMs } = useConnection();
  const health = useServerHealth(status);

  const serverText = health === null ? 'Checking…' : health.ok ? `Up ${formatUptime(health.uptime)}` : 'Unreachable';

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <span className={styles.mark} aria-hidden="true">
          ♠
        </span>
        <h1 className={styles.title}>Private Hold'em</h1>
        <p className={styles.tagline}>Texas Hold'em with friends. Virtual chips only.</p>
      </header>

      <section className={styles.panel} aria-label="Connection status">
        <dl className={styles.list}>
          <div className={styles.row}>
            <dt>Realtime</dt>
            <dd className={styles.status} data-status={status} data-testid="socket-status">
              {STATUS_TEXT[status]}
            </dd>
          </div>
          <div className={styles.row}>
            <dt>Latency</dt>
            <dd className={styles.mono}>{latencyMs === null ? '—' : `${latencyMs} ms`}</dd>
          </div>
          <div className={styles.row}>
            <dt>Server</dt>
            <dd data-testid="server-health">{serverText}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
