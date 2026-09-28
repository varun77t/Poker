import type { GameView, PlayerId } from '@poker/shared';
import { getLegalActions } from './betting';
import { buildPots } from './pots';
import type { HandState } from './types';

/**
 * The ONLY way hand state leaves the server (CLAUDE.md). Each player gets their own projection:
 * - their own hole cards always;
 * - anyone else's only once revealed (all-in run-out R-5.8, showdown R-7.3), and folded hands never;
 * - never the deck.
 * Builds fresh objects, so callers can't reach back into the engine state.
 */
export function toGameView(state: HandState, viewerId: PlayerId, options: { turnDeadline?: number | null } = {}): GameView {
  const handOver = state.awaiting === 'none';
  return {
    handId: state.handId,
    seq: state.seq,
    street: state.street,
    board: [...state.board],
    // R-6.5: pots from previous streets; this street's chips are each player's `committed`.
    pots: handOver
      ? []
      : buildPots(
          state.players.map((p) => ({ seat: p.seat, contributed: p.contributed - p.committed, folded: p.status === 'folded' })),
        ).pots,
    buttonSeat: state.buttonSeat,
    sbSeat: state.sbSeat,
    bbSeat: state.bbSeat,
    toActSeat: state.toActSeat,
    turnDeadline: options.turnDeadline ?? null,
    players: state.players.map((p) => {
      const visible = p.playerId === viewerId || (state.allRevealed && p.status !== 'folded');
      return {
        seat: p.seat,
        playerId: p.playerId,
        stack: p.stack,
        committed: p.committed,
        status: p.status,
        lastAction: p.lastAction ? { ...p.lastAction } : null,
        holeCards: visible ? [p.holeCards[0], p.holeCards[1]] : null,
      };
    }),
    legalActions: getLegalActions(state, viewerId),
    result: state.result ? structuredClone(state.result) : null,
  };
}
