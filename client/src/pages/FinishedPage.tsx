import '@fontsource/barlow-semi-condensed/500.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/barlow-semi-condensed/700.css';
import '@fontsource/marcellus/400.css';
import { MIN_PLAYERS_TO_START, changedSettingKeys, type Card, type RoomSettings, type TableSnapshot } from '@poker/shared';
import { useEffect, useId, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { SettingsForm } from '../components/SettingsForm';
import { PokerTable } from '../components/table/PokerTable';
import { BarMeta, RoomBar } from '../components/table/RoomBar';
import { cx } from '../lib/cx';
import { request } from '../socket/connection';
import { setState, useAppState } from '../state/store';
import room from '../styles/cardRoom.module.css';
import { buildStandings, buildTableModel, formatChips, formatNet, summarizeGame, type Standing } from '../table/model';
import styles from './FinishedPage.module.css';

const SETTINGS_NOTE_MS = 8000;

/**
 * The game is over (room status `finished`). The table rests on the left with the winner named on
 * the felt; the final standings and the next game take the right. Everything shown comes from the
 * server's `finalResults`; the host can change settings and start the next game.
 */
/** `startEditing` opens the settings editor straight away (the dev review page uses it). */
export function FinishedPage({ snapshot, startEditing = false }: { snapshot: TableSnapshot; startEditing?: boolean }) {
  const { room: roomView } = snapshot;
  const navigate = useNavigate();
  const standings = useMemo(() => buildStandings(roomView), [roomView]);
  // The game's winner (or co-winners) keep the brass edge on the resting table, tying the seat to the felt plate.
  const model = useMemo(() => {
    const top = new Set(standings.filter((s) => s.isTop).map((s) => s.playerId));
    const base = buildTableModel(snapshot);
    return { ...base, seats: base.seats.map((s) => ('empty' in s ? s : { ...s, isWinner: top.has(s.view.playerId) })) };
  }, [snapshot, standings]);
  // The game's result sits where each hand's result did: on the felt, above the (now empty) board.
  const result = useMemo(
    () => ({ ...summarizeGame(standings, (s) => (s.isYou ? 'You' : s.displayName)), highlight: new Set<Card>() }),
    [standings],
  );
  const isHost = roomView.hostId === roomView.youId;
  const [editing, setEditing] = useState(startEditing);
  const [leaving, setLeaving] = useState(false);

  async function leave() {
    setLeaving(true);
    const res = await request('room:leave', {});
    setLeaving(false);
    if (!res.ok && res.error !== 'NOT_IN_ROOM') return;
    navigate('/');
    setState({ snapshot: null });
  }

  return (
    <div className={cx(room.world, styles.page)}>
      <RoomBar
        code={roomView.code}
        meta={<BarMeta label="Game over" />}
        actions={
          <button type="button" className={room.ghost} onClick={() => void leave()} disabled={leaving}>
            Leave table
          </button>
        }
      />
      <main className={styles.stage}>
        <section className={styles.tableArea} aria-label="The table">
          <PokerTable snapshot={snapshot} model={model} result={result} clock={null} resting />
        </section>
        <aside className={styles.side}>
          {editing && isHost ? (
            <SettingsEditor settings={roomView.settings} onDone={() => setEditing(false)} />
          ) : (
            <>
              <Standings standings={standings} />
              <NextGame snapshot={snapshot} onChangeSettings={() => setEditing(true)} />
            </>
          )}
        </aside>
      </main>
    </div>
  );
}

function Standings({ standings }: { standings: Standing[] }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        Final standings
      </h2>
      {standings.length === 0 ? (
        <p className={styles.empty}>No hands were played, so there are no results.</p>
      ) : (
        <ol className={styles.list}>
          {standings.map((s, i) => (
            <li
              key={s.playerId}
              className={cx(styles.row, s.isTop && styles.top, s.left && styles.gone)}
              style={{ '--i': i } as CSSProperties}
            >
              <span className={styles.rank}>{s.rank}</span>
              <span className={styles.avatar} aria-hidden="true">
                {([...s.displayName][0] ?? '?').toLocaleUpperCase()}
              </span>
              <span className={styles.who}>
                <span className={styles.name}>
                  <span className={styles.nameText}>{s.isYou ? 'You' : s.displayName}</span>
                  {s.left && <span className={styles.tag}>Left</span>}
                </span>
                <span className={styles.detail}>
                  {formatChips(s.finalStack)} chips
                  {s.rebuys > 0 && `, ${s.rebuys} ${s.rebuys === 1 ? 'rebuy' : 'rebuys'}`}
                </span>
              </span>
              <span className={cx(styles.net, s.net > 0 && styles.up, s.net < 0 && styles.down)}>{formatNet(s.net)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function NextGame({ snapshot, onChangeSettings }: { snapshot: TableSnapshot; onChangeSettings: () => void }) {
  const { room: roomView } = snapshot;
  const { settings } = roomView;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isHost = roomView.hostId === roomView.youId;
  const seated = roomView.seats.filter((s) => s !== null);
  const hostName = seated.find((s) => s.playerId === roomView.hostId)?.displayName ?? 'the host';
  const enough = seated.length >= MIN_PLAYERS_TO_START;

  // Everyone sees what the host changed, for a few seconds (adjusting state during render, not in an effect).
  const [seen, setSeen] = useState(settings);
  const [changed, setChanged] = useState<(keyof RoomSettings)[]>([]);
  const diff = changedSettingKeys(seen, settings);
  if (diff.length > 0) {
    setSeen(settings);
    setChanged(diff);
  }
  useEffect(() => {
    if (changed.length === 0) return;
    const timer = window.setTimeout(() => setChanged([]), SETTINGS_NOTE_MS);
    return () => window.clearTimeout(timer);
  }, [changed]);
  const mark = (...keys: (keyof RoomSettings)[]) => (changed.some((k) => keys.includes(k)) ? true : undefined);

  async function start() {
    setBusy(true);
    setError(null);
    const res = await request('game:start', {});
    // On success the room is playing again and the table screen takes over.
    if (!res.ok) {
      setBusy(false);
      setError(res.message);
    }
  }

  return (
    <section className={styles.next} aria-label="Next game">
      <p className={styles.settings}>
        Next game: <b data-changed={mark('startingStack')}>{formatChips(settings.startingStack)}</b> chips, blinds{' '}
        <b data-changed={mark('smallBlind', 'bigBlind')}>
          {formatChips(settings.smallBlind)}/{formatChips(settings.bigBlind)}
        </b>
        , <b data-changed={mark('turnSeconds')}>{settings.turnSeconds}s</b> turns, rebuys{' '}
        <b data-changed={mark('rebuys')}>{settings.rebuys ? 'on' : 'off'}</b>.
      </p>
      {changed.length > 0 && !isHost && (
        <p className={styles.note} role="status">
          {hostName} changed the settings.
        </p>
      )}
      {isHost ? (
        <>
          <div className={styles.hostRow}>
            <button
              type="button"
              className={cx(room.act, room.primary)}
              disabled={!enough || busy}
              onClick={() => void start()}
            >
              Start next game
            </button>
            <button type="button" className={room.ghost} onClick={onChangeSettings} disabled={busy}>
              Change settings
            </button>
          </div>
          {!enough && <p className={styles.hint}>Everyone else has left. Invite a friend with the room code to play again.</p>}
        </>
      ) : (
        <p className={styles.waitingFor}>Waiting for {hostName} to start the next game.</p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** The host edits the next game's settings in place of the standings; they apply on restart. */
function SettingsEditor({ settings, onDone }: { settings: RoomSettings; onDone: () => void }) {
  const titleId = useId();
  const connected = useAppState((s) => s.connection === 'connected');

  async function save(next: RoomSettings): Promise<string | null> {
    const res = await request('room:updateSettings', { settings: next });
    if (!res.ok) return res.message;
    onDone();
    return null;
  }

  return (
    <section className={styles.editor} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        Settings for the next game
      </h2>
      <p className={styles.editorHint}>Everyone starts the next game with the new starting chips.</p>
      <div className={styles.form}>
        <SettingsForm
          initial={settings}
          submitLabel="Save settings"
          submitDisabled={!connected}
          onSubmit={save}
          autoFocus
          footer={
            <Button variant="ghost" fullWidth onClick={onDone}>
              Cancel
            </Button>
          }
        />
      </div>
    </section>
  );
}
