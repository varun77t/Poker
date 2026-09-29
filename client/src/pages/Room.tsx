import { isValidRoomCode, normalizeRoomCode, type ErrorCode } from '@poker/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../components/Button';
import { Brand, Card, Notice, Page } from '../components/Layout';
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

  if (!inRoom || !snapshot) {
    return (
      <Page>
        <Brand />
        <Card>
          <p className={styles.joining} role="status">
            {connection === 'connected' ? 'Joining room' : 'Connecting'} <span className={styles.code}>{code}</span>…
          </p>
        </Card>
      </Page>
    );
  }

  if (snapshot.room.status === 'playing') return <TablePage snapshot={snapshot} />;
  if (snapshot.room.status === 'finished') return <FinishedPage snapshot={snapshot} />;
  return <Lobby snapshot={snapshot} />;
}

function NamePrompt({ code }: { code: string }) {
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
    <Page>
      <Brand />
      <Card>
        <div>
          <p className={styles.eyebrow}>You're invited to</p>
          <h1 className={styles.heading}>
            Room <span className={styles.code}>{code}</span>
          </h1>
        </div>
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
          <Button type="submit" fullWidth busy={busy}>
            Join room
          </Button>
        </form>
      </Card>
    </Page>
  );
}

function RoomProblem({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <Page>
      <Brand />
      <Card>
        <h1 className={styles.heading}>{title}</h1>
        <Notice tone="error">{message}</Notice>
        {onRetry && (
          <Button variant="secondary" fullWidth onClick={onRetry}>
            Try again
          </Button>
        )}
        <Link to="/" className={styles.homeLink}>
          Back to start
        </Link>
      </Card>
    </Page>
  );
}
