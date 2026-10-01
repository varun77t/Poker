import { MAX_SEATS, MIN_PLAYERS_TO_START, type SeatView, type TableSnapshot } from '@poker/shared';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router';
import { SettingsEditor } from '../components/SettingsEditor';
import { SettingsFacts } from '../components/SettingsFacts';
import { useChangedSettings } from '../components/useChangedSettings';
import { SuitSymbols } from '../components/table/PlayingCard';
import { PokerTable } from '../components/table/PokerTable';
import { BarLabel, BarMeta, RoomBar } from '../components/table/RoomBar';
import { cx } from '../lib/cx';
import { request } from '../socket/connection';
import { setState } from '../state/store';
import { notifyError } from '../state/toasts';
import room from '../styles/cardRoom.module.css';
import { buildTableModel } from '../table/model';
import styles from './Lobby.module.css';

const isSeat = (s: SeatView | null): s is SeatView => s !== null;

/**
 * Before the first hand (room status `waiting`): everyone already sits at the table, so the lobby
 * is the table itself with nothing dealt. The host fills open seats with bots from the seats
 * themselves; the side column carries the invite, the settings and the Start button.
 */
export function Lobby({ snapshot, startEditing = false }: { snapshot: TableSnapshot; startEditing?: boolean }) {
  const { room: roomView } = snapshot;
  const navigate = useNavigate();
  const model = useMemo(() => buildTableModel(snapshot), [snapshot]);
  const [editing, setEditing] = useState(startEditing);
  const [leaving, setLeaving] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);

  const seated = roomView.seats.filter(isSeat);
  const isHost = roomView.hostId === roomView.youId;
  const hostName = seated.find((s) => s.playerId === roomView.hostId)?.displayName ?? 'the host';
  const enough = seated.length >= MIN_PLAYERS_TO_START;
  const showEditor = editing && isHost;

  // Return focus to Edit settings when the editor closes.
  const editorWasOpen = useRef(false);
  useEffect(() => {
    if (editorWasOpen.current && !showEditor) editButton.current?.focus();
    editorWasOpen.current = showEditor;
  }, [showEditor]);

  const plate = {
    title: 'Waiting to start',
    text: isHost
      ? enough
        ? 'Start the game when everyone is seated.'
        : 'Invite a friend, or press an open seat to add a bot.'
      : `${hostName} starts the game when everyone is here.`,
  };

  async function leave() {
    setLeaving(true);
    const res = await request('room:leave', {});
    setLeaving(false);
    if (!res.ok && res.error !== 'NOT_IN_ROOM') {
      notifyError(res.message);
      return;
    }
    navigate('/');
    setState({ snapshot: null });
  }

  return (
    <div className={cx(room.world, room.withSide)}>
      <SuitSymbols />
      <RoomBar
        code={roomView.code}
        meta={<BarMeta label="Players" value={`${seated.length} / ${MAX_SEATS}`} testId="player-count" />}
        actions={
          <button type="button" className={room.ghost} onClick={() => void leave()} disabled={leaving}>
            <BarLabel long="Leave room" short="Leave" />
          </button>
        }
      />
      <main className={room.sideStage}>
        <section className={room.tableArea} aria-label="The table">
          <PokerTable snapshot={snapshot} model={model} result={null} clock={null} plate={plate} />
        </section>
        <aside className={cx(room.side, !showEditor && styles.side)}>
          {showEditor ? (
            <SettingsEditor
              settings={roomView.settings}
              title="Room settings"
              hint="Changing the starting chips resets everyone's chips to the new amount."
              onDone={() => setEditing(false)}
            />
          ) : (
            <>
              <Invite code={roomView.code} />
              <StartPanel
                snapshot={snapshot}
                hostName={hostName}
                enough={enough}
                onEdit={() => setEditing(true)}
                editButton={editButton}
              />
            </>
          )}
        </aside>
      </main>
    </div>
  );
}

function Invite({ code }: { code: string }) {
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);
  const link = `${window.location.origin}/room/${code}`;

  useEffect(() => {
    if (copied !== 'yes') return;
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

  // On a phone the system share sheet sends the link straight to a chat; elsewhere it is copied.
  const canShare = typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches;
  async function share() {
    try {
      await navigator.share({ title: "Private Hold'em", text: `Join my poker table, room ${code}`, url: link });
    } catch (error) {
      if ((error as Error).name !== 'AbortError') await copy();
    }
  }

  return (
    <section className={styles.invite} aria-labelledby="invite-title">
      <h2 id="invite-title" className={styles.title}>
        Invite your friends
      </h2>
      <p className={styles.code} data-testid="room-code" aria-label={`Room code ${code.split('').join(' ')}`}>
        {code}
      </p>
      <p className={styles.hint}>They enter the code on the home screen, or open the link.</p>
      <button type="button" className={cx(room.act, styles.copy)} onClick={() => void (canShare ? share() : copy())}>
        {copied === 'yes' ? 'Link copied' : canShare ? 'Share invite link' : 'Copy invite link'}
      </button>
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
    </section>
  );
}

interface StartProps {
  snapshot: TableSnapshot;
  hostName: string;
  enough: boolean;
  onEdit: () => void;
  editButton: RefObject<HTMLButtonElement | null>;
}

function StartPanel({ snapshot, hostName, enough, onEdit, editButton }: StartProps) {
  const { settings, hostId, youId } = snapshot.room;
  const isHost = hostId === youId;
  const changed = useChangedSettings(settings);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    const res = await request('game:start', {});
    // On success the room is playing and the table screen takes over.
    if (!res.ok) {
      setBusy(false);
      notifyError(res.message);
    }
  }

  return (
    <section className={cx(room.sidePanel, styles.start)} aria-label="Start the game">
      <SettingsFacts settings={settings} changed={changed} lead="Everyone starts with" />
      {changed.length > 0 && !isHost && (
        <p className={styles.note} role="status">
          {hostName} changed the settings.
        </p>
      )}
      {isHost ? (
        <>
          <div className={styles.hostRow}>
            <button type="button" className={cx(room.act, room.primary)} disabled={!enough || busy} onClick={() => void start()}>
              Start game
            </button>
            <button ref={editButton} type="button" className={room.ghost} onClick={onEdit} disabled={busy}>
              Edit settings
            </button>
          </div>
          {!enough && <p className={styles.hint}>A game needs two players. Invite a friend or add a bot.</p>}
        </>
      ) : (
        <p className={styles.waitingFor}>Waiting for {hostName} to start the game.</p>
      )}
    </section>
  );
}
