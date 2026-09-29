import { MAX_SEATS, type GameView, type PlayerId } from '@poker/shared';
import { winnings } from './model';

/**
 * Works out what should visibly move between two consecutive snapshots of the same table. The
 * screen always renders the new snapshot; these steps only animate copies of cards and chips flying
 * between named anchors on top of it (see useTableMotion). Pure, so the choreography is testable.
 *
 * Anchors: `deck`, `pot`, `plaque-<seat>`, `bet-<seat>`, `hole-<seat>-<0|1>`, `board-<0..4>`.
 */
export type MotionStep =
  /** A face-down card from the deck to a hole-card slot; the viewer's own cards turn over on landing. */
  | { kind: 'deal'; to: string; delay: number; flip: boolean }
  /** A community card from the deck, turning over on landing. */
  | { kind: 'board'; to: string; delay: number }
  /** Chips from one anchor to another. `fromPrevious` measures the start in the previous render. */
  | { kind: 'chips'; from: string; to: string; amount: number; delay: number; fromPrevious?: boolean; float?: boolean }
  /** Cards already on the table turning face up (showdown, all-in run-out). */
  | { kind: 'reveal'; target: string; delay: number };

export const TIMING = {
  flight: 360,
  dealStagger: 70,
  dealStart: 300,
  sweepDelay: 420,
  boardStagger: 150,
  payoutDelay: 1100,
} as const;

const cw = (from: number, to: number) => (to - from + MAX_SEATS) % MAX_SEATS || MAX_SEATS;

/** Seats in deal order: one card each starting left of the button, twice around (R-2.7). */
function dealOrder(game: GameView): number[] {
  return game.players.map((p) => p.seat).sort((a, b) => cw(game.buttonSeat, a) - cw(game.buttonSeat, b));
}

export function planMotion(prev: GameView | null, next: GameView | null, viewerId: PlayerId): MotionStep[] {
  if (!next) return [];
  const steps: MotionStep[] = [];

  // A fresh hand (seq 0 is the moment it was dealt). Joining or reconnecting mid-hand animates nothing.
  if (prev?.handId !== next.handId) {
    if (next.seq !== 0) return [];
    for (const p of next.players) {
      if (p.committed > 0) steps.push({ kind: 'chips', from: `plaque-${p.seat}`, to: `bet-${p.seat}`, amount: p.committed, delay: 0 });
    }
    const order = dealOrder(next);
    order.concat(order).forEach((seat, i) => {
      const card = i < order.length ? 0 : 1;
      const own = next.players.find((p) => p.seat === seat)?.playerId === viewerId;
      steps.push({ kind: 'deal', to: `hole-${seat}-${card}`, delay: TIMING.dealStart + i * TIMING.dealStagger, flip: own && card === 1 });
    });
    return steps;
  }

  const before = new Map(prev.players.map((p) => [p.seat, p]));
  const prevBets = prev.players.filter((p) => p.committed > 0);
  const nextBets = next.players.reduce((sum, p) => sum + p.committed, 0);
  const handEnded = !prev.result && !!next.result;
  // The betting round closed: this street's bets leave the space in front of the players.
  const roundClosed = prevBets.length > 0 && (nextBets === 0 || handEnded);

  if (roundClosed) {
    // The action that closed the round (usually a call) lands in front of its player first, then
    // every bet sweeps into the pot. Stacks can't identify that player once winnings are paid, but
    // the player whose turn it was, and what they did, can.
    const closer = next.players.find((p) => p.seat === prev.toActSeat);
    const act = closer?.lastAction;
    const closing =
      closer && act && act.type !== 'fold' && act.type !== 'check' && act.amount ? { seat: closer.seat, amount: act.amount } : null;
    if (closing) {
      steps.push({ kind: 'chips', from: `plaque-${closing.seat}`, to: `bet-${closing.seat}`, amount: closing.amount, delay: 0 });
      steps.push({ kind: 'chips', from: `bet-${closing.seat}`, to: 'pot', amount: closing.amount, delay: TIMING.sweepDelay });
    }
    for (const p of prevBets) {
      if (p.seat === closing?.seat) continue;
      steps.push({ kind: 'chips', from: `bet-${p.seat}`, to: 'pot', amount: p.committed, delay: TIMING.sweepDelay, fromPrevious: true });
    }
  } else {
    for (const p of next.players) {
      const was = before.get(p.seat);
      if (was && p.committed > was.committed) {
        steps.push({ kind: 'chips', from: `plaque-${p.seat}`, to: `bet-${p.seat}`, amount: p.committed, delay: 0 });
      }
    }
  }

  for (const p of next.players) {
    const was = before.get(p.seat);
    if (was && p.playerId !== viewerId && !was.holeCards && p.holeCards) {
      steps.push({ kind: 'reveal', target: `hole-${p.seat}-0`, delay: 0 }, { kind: 'reveal', target: `hole-${p.seat}-1`, delay: 90 });
    }
  }

  for (let i = prev.board.length; i < next.board.length; i++) {
    steps.push({ kind: 'board', to: `board-${i}`, delay: (i - prev.board.length) * TIMING.boardStagger });
  }

  if (handEnded) {
    for (const [playerId, amount] of winnings(next)) {
      const seat = next.players.find((p) => p.playerId === playerId)?.seat;
      if (seat === undefined) continue;
      steps.push({ kind: 'chips', from: 'pot', to: `plaque-${seat}`, amount, delay: TIMING.payoutDelay, float: true });
    }
  }
  return steps;
}
