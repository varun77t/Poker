import { DEFAULT_ROOM_SETTINGS, isValidRoomCode, normalizeRoomCode, ROOM_CODE_LENGTH, SOLO_BOT_COUNT } from '@poker/shared';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { Notice } from '../components/Layout';
import { SuitSymbols } from '../components/table/PlayingCard';
import { TableScene } from '../components/TableScene';
import { TextField } from '../components/TextField';
import { loadName } from '../lib/storage';
import { ensureSession } from '../session/session';
import { request } from '../socket/connection';
import { useAppState } from '../state/store';
import styles from './Landing.module.css';

export function Landing() {
  const navigate = useNavigate();
  const session = useAppState((s) => s.session);
  const snapshot = useAppState((s) => s.snapshot);

  const [name, setName] = useState(() => session?.displayName ?? loadName());
  const [code, setCode] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'create' | 'join' | 'bots' | null>(null);
  const [botsError, setBotsError] = useState<string | null>(null);

  async function continueWithName(action: 'create' | 'join', destination: string) {
    setBusy(action);
    const res = await ensureSession(name);
    setBusy(null);
    if (!res.ok) {
      setNameError(res.message);
      return;
    }
    navigate(destination);
  }

  /** A room of your own with three Medium bots, opened at its lobby so you can adjust before starting. */
  async function playBots() {
    setBusy('bots');
    setBotsError(null);
    const session = await ensureSession(name);
    if (!session.ok) {
      setBusy(null);
      setNameError(session.message);
      return;
    }
    const res = await request('room:create', {
      settings: { ...DEFAULT_ROOM_SETTINGS },
      bots: Array.from({ length: SOLO_BOT_COUNT }, () => 'medium' as const),
    });
    setBusy(null);
    if (!res.ok) {
      setBotsError(res.message);
      return;
    }
    navigate(`/room/${res.data.code}`);
  }

  function onJoin(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeRoomCode(code);
    if (!isValidRoomCode(normalized)) {
      setCodeError(`Room codes are ${ROOM_CODE_LENGTH} letters or numbers.`);
      return;
    }
    void continueWithName('join', `/room/${normalized}`);
  }

  return (
    <div className={styles.page}>
      <SuitSymbols />
      <main className={styles.intro}>
        <h1 className={styles.title}>Private Hold'em</h1>
        <p className={styles.lede}>Texas Hold'em for you and your friends. Share a code, take a seat. Virtual chips only.</p>

        {snapshot && (
          <Notice>
            You're seated in room <strong>{snapshot.room.code}</strong>. <Link to={`/room/${snapshot.room.code}`}>Return to the room</Link>
          </Notice>
        )}

        <div className={styles.form}>
          <TextField
            label="Your name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
            error={nameError}
            placeholder="What should the table call you?"
            autoComplete="nickname"
            maxLength={40}
          />

          <div className={styles.start}>
            <Button variant="primary" busy={busy === 'create'} disabled={busy !== null} onClick={() => void continueWithName('create', '/create')}>
              Create a room
            </Button>
            <Button busy={busy === 'bots'} disabled={busy !== null} onClick={() => void playBots()}>
              Play against bots
            </Button>
          </div>
          {botsError && <Notice tone="error">{botsError}</Notice>}

          <form className={styles.join} onSubmit={onJoin} noValidate>
            <TextField
              label="Join a friend's room"
              code
              value={code}
              onChange={(e) => {
                setCode(normalizeRoomCode(e.target.value).slice(0, ROOM_CODE_LENGTH));
                setCodeError(null);
              }}
              error={codeError}
              placeholder="ROOM CODE"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
            <Button type="submit" busy={busy === 'join'} disabled={busy !== null} className={styles.joinButton}>
              Join
            </Button>
          </form>
        </div>
      </main>
      <div className={styles.scene}>
        <TableScene />
      </div>
    </div>
  );
}
