import {
  MAX_SEATS,
  MIN_PLAYERS_TO_START,
  changedSettingKeys,
  type RoomSettings,
  type SeatView,
  type TableSnapshot,
} from '@poker/shared';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { Brand, Card, Notice, Page } from '../components/Layout';
import { SettingsForm } from '../components/SettingsForm';
import { request } from '../socket/connection';
import { setState, useAppState } from '../state/store';
import styles from './Lobby.module.css';

const isSeat = (s: SeatView | null): s is SeatView => s !== null;

function initial(name: string): string {
  return ([...name][0] ?? '?').toLocaleUpperCase();
}

/** Shown to everyone for a few seconds after the host changes the settings. */
interface SettingsNote {
  text: string;
  changed: (keyof RoomSettings)[];
}

const SETTINGS_NOTE_MS = 8000;

export function Lobby({ snapshot }: { snapshot: TableSnapshot }) {
  const { room } = snapshot;
  const navigate = useNavigate();
  const connected = useAppState((s) => s.connection === 'connected');
  const [busy, setBusy] = useState<'start' | 'leave' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);

  const seated = room.seats.filter(isSeat);
  const isHost = room.hostId === room.youId;
  const hostName = seated.find((s) => s.playerId === room.hostId)?.displayName ?? 'the host';
  const enoughPlayers = seated.length >= MIN_PLAYERS_TO_START;
  const { settings } = room;
  const canEdit = isHost && room.status !== 'playing';
  const showEditor = editing && canEdit;

  // Detect setting changes between snapshots (adjusting state during render, not in an effect).
  const [seenSettings, setSeenSettings] = useState(settings);
  const [settingsNote, setSettingsNote] = useState<SettingsNote | null>(null);
  const changed = changedSettingKeys(seenSettings, settings);
  if (changed.length > 0) {
    setSeenSettings(settings);
    const stacksReset = changed.includes('startingStack') && room.status === 'waiting';
    setSettingsNote({
      changed,
      text:
        (isHost ? 'Settings saved.' : `${hostName} changed the settings.`) +
        (stacksReset ? ` Everyone now starts with ${settings.startingStack.toLocaleString()} chips.` : ''),
    });
  }

  useEffect(() => {
    if (!settingsNote) return;
    const timer = window.setTimeout(() => setSettingsNote(null), SETTINGS_NOTE_MS);
    return () => window.clearTimeout(timer);
  }, [settingsNote]);

  // Return focus to the Edit button when the editor closes.
  const editorWasOpen = useRef(false);
  useEffect(() => {
    if (editorWasOpen.current && !showEditor) editButton.current?.focus();
    editorWasOpen.current = showEditor;
  }, [showEditor]);

  const highlight = (...keys: (keyof RoomSettings)[]) =>
    settingsNote?.changed.some((k) => keys.includes(k)) ? true : undefined;

  async function saveSettings(next: RoomSettings): Promise<string | null> {
    const res = await request('room:updateSettings', { settings: next });
    if (!res.ok) return res.message;
    setEditing(false);
    return null;
  }

  async function start() {
    setBusy('start');
    setError(null);
    const res = await request('game:start', {});
    setBusy(null);
    if (!res.ok) setError(res.message);
  }

  async function leave() {
    setBusy('leave');
    setError(null);
    const res = await request('room:leave', {});
    setBusy(null);
    if (!res.ok && res.error !== 'NOT_IN_ROOM') {
      setError(res.message);
      return;
    }
    navigate('/');
    setState({ snapshot: null });
  }

  return (
    <Page>
      <Brand />

      <Card>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Room code</p>
            <p className={styles.code} data-testid="room-code">
              {room.code}
            </p>
          </div>
          <InviteLink code={room.code} />
        </div>

        {showEditor ? (
          <div className={styles.editor}>
            <div>
              <h2 className={styles.editorTitle}>Room settings</h2>
              {room.status === 'waiting' && (
                <p className={styles.editorHint}>Changing the starting chips resets everyone's chips to the new amount.</p>
              )}
            </div>
            <SettingsForm
              initial={settings}
              submitLabel="Save settings"
              submitDisabled={!connected}
              onSubmit={saveSettings}
              autoFocus
              footer={
                <Button variant="ghost" fullWidth onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              }
            />
          </div>
        ) : (
          <ul className={styles.settings} aria-label="Room settings">
            <li data-changed={highlight('smallBlind', 'bigBlind')}>
              Blinds {settings.smallBlind.toLocaleString()}/{settings.bigBlind.toLocaleString()}
            </li>
            <li data-changed={highlight('startingStack')}>{settings.startingStack.toLocaleString()} chips</li>
            <li data-changed={highlight('turnSeconds')}>{settings.turnSeconds}s per turn</li>
            <li data-changed={highlight('rebuys')}>Rebuys {settings.rebuys ? 'on' : 'off'}</li>
            {canEdit && (
              <li className={styles.editItem}>
                <button ref={editButton} type="button" className={styles.editButton} onClick={() => setEditing(true)}>
                  Edit settings
                </button>
              </li>
            )}
          </ul>
        )}

        {settingsNote && !showEditor && <Notice>{settingsNote.text}</Notice>}
      </Card>

      <Card>
        <div className={styles.playersHeader}>
          <h2 className={styles.playersTitle}>Players</h2>
          <span className={styles.count} data-testid="player-count">
            {seated.length}/{MAX_SEATS}
          </span>
        </div>

        <ol className={styles.seats}>
          {room.seats.map((seat, index) =>
            seat ? (
              <li key={seat.playerId} className={styles.seat} data-connected={seat.connected}>
                <span className={styles.avatar} aria-hidden="true">
                  {initial(seat.displayName)}
                </span>
                <span className={styles.name}>{seat.displayName}</span>
                <span className={styles.badges}>
                  {seat.playerId === room.hostId && <span className={styles.hostBadge}>Host</span>}
                  {seat.playerId === room.youId && <span className={styles.badge}>You</span>}
                  {seat.waitingForNextHand && <span className={styles.badge}>Next hand</span>}
                  {!seat.connected && <span className={styles.offline}>Reconnecting…</span>}
                </span>
              </li>
            ) : (
              <li key={`open-${index}`} className={styles.openSeat}>
                Open seat
              </li>
            ),
          )}
        </ol>
      </Card>

      {error && <Notice tone="error">{error}</Notice>}

      <div className={styles.actions}>
        {isHost ? (
          <>
            <Button
              fullWidth
              busy={busy === 'start'}
              disabled={!enoughPlayers || busy !== null || showEditor}
              onClick={() => void start()}
            >
              Start game
            </Button>
            {showEditor ? (
              <p className={styles.hint}>Save or cancel your settings changes to start.</p>
            ) : (
              !enoughPlayers && <p className={styles.hint}>Invite at least one more player to start.</p>
            )}
          </>
        ) : (
          <p className={styles.waiting}>Waiting for {hostName} to start the game…</p>
        )}
        <Button variant="ghost" fullWidth busy={busy === 'leave'} disabled={busy !== null} onClick={() => void leave()}>
          Leave room
        </Button>
      </div>
    </Page>
  );
}

function InviteLink({ code }: { code: string }) {
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);
  const link = `${window.location.origin}/room/${code}`;

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied('yes');
    } catch {
      // Clipboard needs a secure context (https or localhost); fall back to showing the link.
      setCopied('failed');
    }
  }

  return (
    <div className={styles.invite}>
      <Button variant="secondary" onClick={() => void copy()}>
        {copied === 'yes' ? 'Link copied' : 'Copy invite link'}
      </Button>
      {copied === 'failed' && (
        <input
          className={styles.linkFallback}
          readOnly
          value={link}
          aria-label="Invite link"
          onFocus={(e) => e.currentTarget.select()}
          autoFocus
        />
      )}
    </div>
  );
}
