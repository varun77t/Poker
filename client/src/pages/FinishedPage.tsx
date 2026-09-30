import { MIN_PLAYERS_TO_START, type Card, type TableSnapshot } from '@poker/shared';
import { useId, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { SettingsEditor } from '../components/SettingsEditor';
import { SettingsFacts } from '../components/SettingsFacts';
import { useChangedSettings } from '../components/useChangedSettings';
import { PokerTable } from '../components/table/PokerTable';
import { BarMeta, RoomBar } from '../components/table/RoomBar';
import { cx } from '../lib/cx';
import { request } from '../socket/connection';
import { setState } from '../state/store';
import { notifyError } from '../state/toasts';
import room from '../styles/cardRoom.module.css';
import { BOT_LEVEL_TEXT, buildStandings, buildTableModel, formatChips, formatNet, summarizeGame, type Standing } from '../table/model';
import styles from './FinishedPage.module.css';

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
  // The game's winner (or co-winners) keep the lit edge on the resting table, tying the seat to the felt plate.
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
    if (!res.ok && res.error !== 'NOT_IN_ROOM') {
      notifyError(res.message);
      return;
    }
    navigate('/');
    setState({ snapshot: null });
  }

  return (
    <div className={cx(room.world, room.withSide)}>
      <RoomBar
        code={roomView.code}
        meta={<BarMeta label="Game over" />}
        actions={
          <button type="button" className={room.ghost} onClick={() => void leave()} disabled={leaving}>
            Leave table
          </button>
        }
      />
      <main className={room.sideStage}>
        <section className={room.tableArea} aria-label="The table">
          <PokerTable snapshot={snapshot} model={model} result={result} clock={null} resting />
        </section>
        <aside className={room.side}>
          {editing && isHost ? (
            <SettingsEditor
              settings={roomView.settings}
              title="Settings for the next game"
              hint="Everyone starts the next game with the new starting chips."
              onDone={() => setEditing(false)}
            />
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
              <span className={cx(styles.avatar, s.botLevel && styles.botAvatar)} aria-hidden="true">
                {([...s.displayName][0] ?? '?').toLocaleUpperCase()}
              </span>
              <span className={styles.who}>
                <span className={styles.name}>
                  <span className={styles.nameText}>{s.isYou ? 'You' : s.displayName}</span>
                  {s.botLevel && <span className={styles.botMark}>{BOT_LEVEL_TEXT[s.botLevel].name} bot</span>}
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
  const isHost = roomView.hostId === roomView.youId;
  const seated = roomView.seats.filter((s) => s !== null);
  const hostName = seated.find((s) => s.playerId === roomView.hostId)?.displayName ?? 'the host';
  const enough = seated.length >= MIN_PLAYERS_TO_START;

  const changed = useChangedSettings(settings);

  async function start() {
    setBusy(true);
    const res = await request('game:start', {});
    // On success the room is playing again and the table screen takes over.
    if (!res.ok) {
      setBusy(false);
      notifyError(res.message);
    }
  }

  return (
    <section className={cx(room.sidePanel, styles.next)} aria-label="Next game">
      <SettingsFacts settings={settings} changed={changed} lead="Next game:" />
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
    </section>
  );
}
