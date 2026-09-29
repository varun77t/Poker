import { DEFAULT_ROOM_SETTINGS, isValidRoomCode, normalizeRoomCode, ROOM_CODE_LENGTH, SOLO_BOT_COUNT } from '@poker/shared';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { Brand, Card, Notice, Page } from '../components/Layout';
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

  /** A room of your own with three Normal bots, opened at its lobby so you can adjust before starting. */
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
      bots: Array.from({ length: SOLO_BOT_COUNT }, () => 'normal' as const),
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
    <Page>
      <Brand size="large" />

      {snapshot && (
        <Notice>
          You're seated in room <strong className={styles.inlineCode}>{snapshot.room.code}</strong>.{' '}
          <Link to={`/room/${snapshot.room.code}`}>Return to the room</Link>
        </Notice>
      )}

      <Card>
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

        <Button fullWidth busy={busy === 'create'} disabled={busy !== null} onClick={() => void continueWithName('create', '/create')}>
          Create a room
        </Button>
        <Button variant="secondary" fullWidth busy={busy === 'bots'} disabled={busy !== null} onClick={() => void playBots()}>
          Play against bots
        </Button>
        {botsError && <Notice tone="error">{botsError}</Notice>}

        <div className={styles.divider}>
          <span>or join a friend</span>
        </div>

        <form className={styles.joinRow} onSubmit={onJoin} noValidate>
          <TextField
            className={styles.codeField}
            label="Room code"
            code
            value={code}
            onChange={(e) => {
              setCode(normalizeRoomCode(e.target.value).slice(0, ROOM_CODE_LENGTH));
              setCodeError(null);
            }}
            error={codeError}
            placeholder="ABC234"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
          <Button type="submit" variant="secondary" busy={busy === 'join'} disabled={busy !== null} className={styles.joinButton}>
            Join
          </Button>
        </form>
      </Card>
    </Page>
  );
}
