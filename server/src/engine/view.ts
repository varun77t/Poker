import type { GameView, PlayerId, PublicAction } from '@poker/shared';
import { getLegalActions } from './betting';
import { handHint } from './hint';
import { buildPots } from './pots';
import type { HandState } from './types';

/**
 * The ONLY way hand state leaves the server (CLAUDE.md). Each player gets their own projection:
 * - their own hole cards always;
 * - anyone else's only once revealed (all-in run-out R-5.8, showdown R-7.3), and folded hands never;
 * - never the deck.
 * It also carries the hand's public action history, and a hint of what the viewer's own cards make.
 * Builds fresh objects, so callers can't reach back into the engine state.
 */
export function toGameView(state: HandState, viewerId: PlayerId, options: { turnDeadline?: number | null } = {}): GameView {
  const handOver = state.awaiting === 'none';
  const viewer = state.players.find((p) => p.playerId === viewerId);
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
    history: publicHistory(state),
    yourHand: viewer && viewer.status !== 'folded' ? handHint(viewer.holeCards, state.board) : null,
  };
}

/** Actions in order, tagged with their street, from the engine's public log. A forced fold reads as a fold. */
function publicHistory(state: HandState): PublicAction[] {
  const history: PublicAction[] = [];
  let street: PublicAction['street'] = 'preflop';
  for (const event of state.log) {
    if (event.type === 'streetDealt' && event.street !== 'showdown') street = event.street;
    else if (event.type === 'action') history.push({ seat: event.seat, street, ...event.action });
    else if (event.type === 'forcedFold') history.push({ seat: event.seat, street, type: 'fold', allIn: false });
  }
  return history;
}
