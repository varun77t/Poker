import '@fontsource/barlow-semi-condensed/500.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/barlow-semi-condensed/700.css';
import '@fontsource/marcellus/400.css';
import type { GameView, TableSnapshot } from '@poker/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ActionPanel, type OutOfChips } from '../components/table/ActionPanel';
import { HandHintPlate } from '../components/table/HandHint';
import { SuitSymbols } from '../components/table/PlayingCard';
import { PokerTable } from '../components/table/PokerTable';
import { BarConfirm, BarMeta, BarNotice, RoomBar } from '../components/table/RoomBar';
import type { TurnClock } from '../components/table/Seat';
import { cx } from '../lib/cx';
import { request } from '../socket/connection';
import { serverNow, setState } from '../state/store';
import room from '../styles/cardRoom.module.css';
import { buildTableModel, summarizeResult, type TableModel } from '../table/model';
import { useTableMotion } from '../table/useTableMotion';
import styles from './TablePage.module.css';

/** The in-game screen (room status `playing`). Renders the server's snapshot and sends intents; decides nothing. */
export function TablePage({ snapshot }: { snapshot: TableSnapshot }) {
  const { room: roomView, game } = snapshot;
  const stage = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const model = useMemo(() => buildTableModel(snapshot), [snapshot]);

  const names = useMemo(() => new Map(roomView.seats.flatMap((s) => (s ? [[s.playerId, s.displayName] as const] : []))), [roomView.seats]);
  const nameOf = (id: string) => (id === roomView.youId ? 'You' : (names.get(id) ?? 'A player'));
  const result = game ? summarizeResult(game, nameOf) : null;

  useTableMotion(stage, overlay, game, roomView.youId);

  const turnMs = roomView.settings.turnSeconds * 1000;
  const clock = useTurnClock(game, turnMs);
  // Countdown text (seconds left, next hand in N) re-reads the clock a few times a second.
  useNow(!!game?.turnDeadline || !!roomView.table?.nextHandAt);
  const secondsLeft = game?.legalActions && game.turnDeadline ? Math.max(0, Math.ceil((game.turnDeadline - serverNow()) / 1000)) : null;

  // Busted (R-10.1): the server marks the seat; whether a rebuy is offered follows the room's setting.
  const mySeat = roomView.seats.find((s) => s?.playerId === roomView.youId);
  const outOfChips: OutOfChips | null = mySeat?.busted ? { rebuyFor: roomView.settings.rebuys ? roomView.settings.startingStack : null } : null;

  return (
    <div className={cx(room.world, styles.page)}>
      <SuitSymbols />
      <Header snapshot={snapshot} />
      <main className={styles.stage} ref={stage}>
        <PokerTable snapshot={snapshot} model={model} result={result} clock={clock} />
        <div className={styles.overlay} ref={overlay} aria-hidden="true" />
      </main>
      {game?.yourHand && <HandHintPlate key={game.handId} hint={game.yourHand} />}
      <ActionPanel game={game} status={statusLine(snapshot, model, nameOf)} secondsLeft={secondsLeft} outOfChips={outOfChips} />
    </div>
  );
}

/** What the viewer is waiting for, in one line. */
function statusLine(snapshot: TableSnapshot, model: TableModel, nameOf: (id: string) => string): string {
  const { room, game } = snapshot;
  const me = model.seats.find((s) => 'isYou' in s && s.isYou);
  const ending = !!room.table?.endingAfterHand;
  if (room.table?.waitingForPlayers) return "You're dealt in as soon as the next hand starts.";
  if (!game) return 'Dealing the next hand';
  if (game.result) {
    const at = room.table?.nextHandAt;
    if (!at) return 'Hand over';
    const seconds = Math.max(1, Math.ceil((at - serverNow()) / 1000));
    return ending ? `Game over in ${seconds}` : `Next hand in ${seconds}`;
  }
  const actor = game.players.find((p) => p.seat === game.toActSeat);
  const waiting = (ending ? 'Last hand. ' : '') + (actor ? `${nameOf(actor.playerId)} is deciding` : 'Dealing');
  if (me && 'player' in me && !me.player) return `You're in from the next hand. ${waiting}`;
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
  const { room: roomView, game } = snapshot;
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState<'leave' | 'end' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inLiveHand = !!game && !game.result && game.players.some((p) => p.playerId === roomView.youId && p.status !== 'folded');
  const isHost = roomView.hostId === roomView.youId;
  const ending = !!roomView.table?.endingAfterHand;
  // Between hands (nothing dealt, or waiting for chips) the game ends at once; otherwise after this hand.
  const endsNow = !game || !!roomView.table?.waitingForPlayers;

  async function leave() {
    setBusy(true);
    const res = await request('room:leave', {});
    setBusy(false);
    if (!res.ok && res.error !== 'NOT_IN_ROOM') return;
    navigate('/');
    setState({ snapshot: null });
  }

  async function endGame() {
    setBusy(true);
    setError(null);
    const res = await request('game:end', {});
    setBusy(false);
    setConfirming(null);
    if (!res.ok) setError(res.message);
  }

  let actions;
  if (confirming === 'leave') {
    actions = (
      <BarConfirm label="Leave the table?">
        <span>Leaving folds your hand.</span>
        <button type="button" className={room.ghost} onClick={() => setConfirming(null)} disabled={busy}>
          Stay
        </button>
        <button type="button" className={room.danger} onClick={() => void leave()} disabled={busy}>
          Leave
        </button>
      </BarConfirm>
    );
  } else if (confirming === 'end') {
    actions = (
      <BarConfirm label="End the game?">
        <span>{endsNow ? 'End the game now?' : 'End the game after this hand?'}</span>
        <button type="button" className={room.ghost} onClick={() => setConfirming(null)} disabled={busy}>
          Keep playing
        </button>
        <button type="button" className={room.danger} onClick={() => void endGame()} disabled={busy}>
          End game
        </button>
      </BarConfirm>
    );
  } else {
    actions = (
      <>
        {error && (
          <span className={room.barError} role="alert">
            {error}
          </span>
        )}
        {ending ? (
          <BarNotice>Last hand</BarNotice>
        ) : (
          isHost && (
            <button type="button" className={room.ghost} onClick={() => setConfirming('end')} disabled={busy}>
              End game
            </button>
          )
        )}
        <button type="button" className={room.ghost} onClick={() => (inLiveHand ? setConfirming('leave') : void leave())} disabled={busy}>
          Leave table
        </button>
      </>
    );
  }

  return (
    <RoomBar
      code={roomView.code}
      meta={
        <>
          {game && <BarMeta label="Hand" value={game.handId} />}
          <BarMeta
            label="Blinds"
            value={`${roomView.settings.smallBlind.toLocaleString('en-US')} / ${roomView.settings.bigBlind.toLocaleString('en-US')}`}
          />
        </>
      }
      actions={actions}
    />
  );
}
