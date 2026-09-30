import { isValidRoomCode, normalizeRoomCode, type ErrorCode } from '@poker/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../components/Button';
import { Panel, Shell } from '../components/Layout';
import { SuitSymbols, PlayingCard } from '../components/table/PlayingCard';
import { TextField } from '../components/TextField';
import { loadName } from '../lib/storage';
import { ensureSession } from '../session/session';
import { request } from '../socket/connection';
import { useAppState } from '../state/store';
import { FinishedPage } from './FinishedPage';
import { Lobby } from './Lobby';
import { TablePage } from './TablePage';
import styles from './Room.module.css';

/** /room/:code — works as an invite link: asks for a name if needed, then joins and shows the room. */
export function RoomPage() {
  const { code: param = '' } = useParams();
  const code = normalizeRoomCode(param);
  const session = useAppState((s) => s.session);

  if (!isValidRoomCode(code)) {
    return <RoomProblem title="That link doesn't look right" message="Room codes are 6 letters or numbers." />;
  }
  if (!session) return <NamePrompt code={code} />;
  // Keyed so that moving between rooms starts from a clean join state.
  return <RoomSession key={code} code={code} />;
}

function RoomSession({ code }: { code: string }) {
  const connection = useAppState((s) => s.connection);
  const snapshot = useAppState((s) => s.snapshot);
  const inRoom = snapshot?.room.code === code;
  const [joinError, setJoinError] = useState<{ error: ErrorCode; message: string } | null>(null);

  // Join on arrival and again after every reconnect (the server may have released the seat meanwhile).
  // Joining is idempotent server-side. Deliberately not keyed on the local snapshot: clearing it when
  // leaving must never trigger a rejoin.
  useEffect(() => {
    if (connection !== 'connected' || joinError) return;
    let cancelled = false;
    void request('room:join', { code }).then((res) => {
      if (!cancelled && !res.ok) setJoinError({ error: res.error, message: res.message });
    });
    return () => {
      cancelled = true;
    };
  }, [connection, joinError, code]);

  if (joinError) {
    const titles: Partial<Record<ErrorCode, string>> = {
      ROOM_NOT_FOUND: 'Room not found',
      ROOM_FULL: 'This room is full',
      RATE_LIMITED: 'Too many attempts',
    };
    return (
      <RoomProblem
        title={titles[joinError.error] ?? "Couldn't join the room"}
        message={joinError.message}
        onRetry={joinError.error === 'ROOM_NOT_FOUND' ? undefined : () => setJoinError(null)}
      />
    );
  }

  if (!inRoom || !snapshot) return <Joining code={code} connected={connection === 'connected'} />;

  if (snapshot.room.status === 'playing') return <TablePage snapshot={snapshot} />;
  if (snapshot.room.status === 'finished') return <FinishedPage snapshot={snapshot} />;
  return <Lobby snapshot={snapshot} />;
}

/** Finding the seat: three backs dealt face down while the join goes through. */
export function Joining({ code, connected }: { code: string; connected: boolean }) {
  return (
    <Shell>
      <SuitSymbols />
      <div className={styles.joining} role="status">
        <span className={styles.backs} aria-hidden="true">
          <PlayingCard card={null} className={styles.back} />
          <PlayingCard card={null} className={styles.back} />
          <PlayingCard card={null} className={styles.back} />
        </span>
        <h1 className={styles.heading}>
          Room <span className={styles.code}>{code}</span>
        </h1>
        <p className={styles.sub}>{connected ? 'Taking your seat…' : 'Connecting to the table…'}</p>
      </div>
    </Shell>
  );
}

export function NamePrompt({ code }: { code: string }) {
  const [name, setName] = useState(loadName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const res = await ensureSession(name);
    setBusy(false);
    if (!res.ok) setError(res.message);
    // On success the session appears in the store and RoomPage renders the room.
  }

  return (
    <Shell>
      <Panel className={styles.panel}>
        <h1 className={styles.heading}>
          Room <span className={styles.code}>{code}</span>
        </h1>
        <p className={styles.sub}>You're invited to play. Tell the table who you are.</p>
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <TextField
            label="Your name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            error={error}
            placeholder="What should the table call you?"
            autoComplete="nickname"
            autoFocus
            maxLength={40}
          />
          <Button type="submit" variant="primary" fullWidth busy={busy}>
            Take a seat
          </Button>
        </form>
      </Panel>
    </Shell>
  );
}

export function RoomProblem({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <Shell>
      <Panel className={styles.panel}>
        <h1 className={styles.heading}>{title}</h1>
        <p className={styles.sub} role="alert">
          {message}
        </p>
        <div className={styles.problemActions}>
          {onRetry && (
            <Button variant="primary" onClick={onRetry}>
              Try again
            </Button>
          )}
          <Link to="/" className={styles.homeLink}>
            Back to start
          </Link>
        </div>
      </Panel>
    </Shell>
  );
}
