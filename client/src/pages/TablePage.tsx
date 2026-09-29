import '@fontsource/barlow-semi-condensed/500.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/barlow-semi-condensed/700.css';
import '@fontsource/marcellus/400.css';
import type { GameView, TableSnapshot } from '@poker/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ActionPanel } from '../components/table/ActionPanel';
import { SuitSymbols } from '../components/table/PlayingCard';
import { PokerTable } from '../components/table/PokerTable';
import type { TurnClock } from '../components/table/Seat';
import { request } from '../socket/connection';
import { serverNow, setState } from '../state/store';
import { buildTableModel, summarizeResult, type TableModel } from '../table/model';
import { useTableMotion } from '../table/useTableMotion';
import styles from './TablePage.module.css';

/** The in-game screen (room status `playing`). Renders the server's snapshot and sends intents; decides nothing. */
export function TablePage({ snapshot }: { snapshot: TableSnapshot }) {
  const { room, game } = snapshot;
  const stage = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const model = useMemo(() => buildTableModel(snapshot), [snapshot]);

  const names = useMemo(() => new Map(room.seats.flatMap((s) => (s ? [[s.playerId, s.displayName] as const] : []))), [room.seats]);
  const nameOf = (id: string) => (id === room.youId ? 'You' : (names.get(id) ?? 'A player'));
  const result = game ? summarizeResult(game, nameOf) : null;

  useTableMotion(stage, overlay, game, room.youId);

  const turnMs = room.settings.turnSeconds * 1000;
  const clock = useTurnClock(game, turnMs);
  // Countdown text (seconds left, next hand in N) re-reads the clock a few times a second.
  useNow(!!game?.turnDeadline || !!room.table?.nextHandAt);
  const secondsLeft = game?.legalActions && game.turnDeadline ? Math.max(0, Math.ceil((game.turnDeadline - serverNow()) / 1000)) : null;

  return (
    <div className={styles.page}>
      <SuitSymbols />
      <Header snapshot={snapshot} />
      <main className={styles.stage} ref={stage}>
        <PokerTable snapshot={snapshot} model={model} result={result} clock={clock} />
        <div className={styles.overlay} ref={overlay} aria-hidden="true" />
      </main>
      <ActionPanel game={game} status={statusLine(snapshot, model, nameOf)} secondsLeft={secondsLeft} />
    </div>
  );
}

/** What the viewer is waiting for, in one line. */
function statusLine(snapshot: TableSnapshot, model: TableModel, nameOf: (id: string) => string): string {
  const { room, game } = snapshot;
  const me = model.seats.find((s) => 'isYou' in s && s.isYou);
  if (room.table?.waitingForPlayers) return 'Waiting for players with chips';
  if (!game) return 'Dealing the next hand';
  if (game.result) {
    const at = room.table?.nextHandAt;
    return at ? `Next hand in ${Math.max(1, Math.ceil((at - serverNow()) / 1000))}` : 'Hand over';
  }
  const actor = game.players.find((p) => p.seat === game.toActSeat);
  const waiting = actor ? `${nameOf(actor.playerId)} is deciding` : 'Dealing';
  if (me && 'player' in me && !me.player) return me.view.busted ? `You're out of chips. ${waiting}` : `You're in from the next hand. ${waiting}`;
  if (me && 'folded' in me && me.folded) return `You folded. ${waiting}`;
  return waiting;
}

/** The running turn's ring timing, fixed once per turn so re-renders don't restart it. */
function useTurnClock(game: GameView | null, totalMs: number): TurnClock | null {
  const key = game && !game.result && game.toActSeat !== null && game.turnDeadline ? `${game.handId}:${game.toActSeat}:${game.turnDeadline}` : null;
  return useMemo(() => {
    if (!key || !game?.turnDeadline) return null;
    const remaining = Math.min(totalMs, Math.max(0, game.turnDeadline - serverNow()));
    return { key, totalMs, elapsedMs: totalMs - remaining };
    // Only a new turn (key) re-derives the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, totalMs]);
}

/** Re-renders a few times a second while something on screen is counting down. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function Header({ snapshot }: { snapshot: TableSnapshot }) {
  const { room, game } = snapshot;
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const inLiveHand = !!game && !game.result && game.players.some((p) => p.playerId === room.youId && p.status !== 'folded');

  async function leave() {
    setBusy(true);
    const res = await request('room:leave', {});
    setBusy(false);
    if (!res.ok && res.error !== 'NOT_IN_ROOM') return;
    navigate('/');
    setState({ snapshot: null });
  }

  return (
    <header className={styles.bar}>
      <span className={styles.mark}>Private Hold'em</span>
      <span className={styles.code} aria-label={`Room code ${room.code}`}>
        {room.code}
      </span>
      {game && (
        <span className={styles.meta}>
          Hand <b>{game.handId}</b>
        </span>
      )}
      <span className={styles.meta}>
        Blinds{' '}
        <b>
          {room.settings.smallBlind.toLocaleString('en-US')} / {room.settings.bigBlind.toLocaleString('en-US')}
        </b>
      </span>
      <span className={styles.spacer} />
      {confirming ? (
        <span className={styles.confirm} role="group" aria-label="Leave the table?">
          <span>Leaving folds your hand.</span>
          <button type="button" className={styles.ghost} onClick={() => setConfirming(false)} disabled={busy}>
            Stay
          </button>
          <button type="button" className={styles.danger} onClick={() => void leave()} disabled={busy}>
            Leave
          </button>
        </span>
      ) : (
        <button type="button" className={styles.ghost} onClick={() => (inLiveHand ? setConfirming(true) : void leave())} disabled={busy}>
          Leave table
        </button>
      )}
    </header>
  );
}
