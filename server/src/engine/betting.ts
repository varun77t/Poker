import type { ActionIntent, LastAction, LegalActions, PlayerId } from '@poker/shared';
import { nextSeatClockwise } from './seats';
import type { EngineError, HandPlayer, HandState } from './types';

/** Betting rules (game-rules §4 and §5). Functions named `apply*` mutate a draft state. */

export const isActive = (p: HandPlayer) => p.status === 'active';
export const notFolded = (p: HandPlayer) => p.status !== 'folded';

export function findPlayer(state: HandState, playerId: PlayerId): HandPlayer | undefined {
  return state.players.find((p) => p.playerId === playerId);
}

export function playerAtSeat(state: HandState, seat: number): HandPlayer {
  const player = state.players.find((p) => p.seat === seat);
  if (!player) throw new Error(`No player at seat ${seat}`);
  return player;
}

/** Still owes an action this round: hasn't acted since action reopened, or hasn't matched the bet (R-5.5). */
export function needsToAct(state: HandState, p: HandPlayer): boolean {
  return p.status === 'active' && (!p.hasActed || p.committed < state.betLevel);
}

/** R-4.5: has not acted since action reopened, or short all-ins since then add up to a full raise. */
function hasRaiseRights(state: HandState, p: HandPlayer): boolean {
  return !p.hasActed || state.betLevel - p.betLevelWhenLastActed >= state.minRaise;
}

/** `null` unless it is this player's turn (R-4.7). */
export function getLegalActions(state: HandState, playerId: PlayerId): LegalActions | null {
  if (state.awaiting !== 'action') return null;
  const p = findPlayer(state, playerId);
  if (!p || p.status !== 'active' || p.seat !== state.toActSeat) return null;

  const maxTo = p.committed + p.stack;
  // R-4.8: betting or raising needs someone who could still respond.
  const someoneCanRespond = state.players.some((q) => q !== p && isActive(q));
  const canCall = state.betLevel > p.committed;
  const canBet = state.betLevel === 0 && p.stack > 0 && someoneCanRespond;
  const canRaise = state.betLevel > 0 && maxTo > state.betLevel && hasRaiseRights(state, p) && someoneCanRespond;

  let minTo = 0;
  if (canBet) minTo = Math.min(state.bigBlind, maxTo); // R-4.2
  else if (canRaise) minTo = Math.min(state.betLevel + state.minRaise, maxTo); // R-4.3

  return {
    canFold: true,
    canCheck: p.committed === state.betLevel,
    canCall,
    callAmount: canCall ? Math.min(state.betLevel - p.committed, p.stack) : 0,
    canBet,
    canRaise,
    minTo,
    maxTo: canBet || canRaise ? maxTo : 0,
  };
}

/** An intent checked against the legal actions, with `allIn` turned into what it means here. */
export type ResolvedAction = { type: 'fold' | 'check' | 'call' } | { type: 'bet' | 'raise'; to: number };

const illegal = (message: string): EngineError => ({ code: 'ILLEGAL_ACTION', message });
const badAmount = (message: string): EngineError => ({ code: 'INVALID_AMOUNT', message });

function checkAmount(verb: string, amount: number, legal: LegalActions): EngineError | null {
  if (amount >= legal.minTo && amount <= legal.maxTo) return null;
  if (legal.minTo === legal.maxTo) return badAmount(`You can only ${verb} all-in, to ${legal.maxTo}.`);
  return badAmount(`${verb === 'bet' ? 'Bet' : 'Raise to'} between ${legal.minTo} and ${legal.maxTo}.`);
}

/** Validates an intent. Never "corrects" an amount (game-rules §4). */
export function resolveIntent(
  state: HandState,
  p: HandPlayer,
  legal: LegalActions,
  intent: ActionIntent,
): ResolvedAction | EngineError {
  const { type, amount } = intent;
  const takesAmount = type === 'bet' || type === 'raise';
  if (!takesAmount && amount !== undefined) return badAmount(`"${type}" does not take an amount.`);
  if (takesAmount && (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0)) {
    return badAmount('Amounts must be a whole number of chips.');
  }

  switch (type) {
    case 'fold':
      return { type: 'fold' };
    case 'check':
      return legal.canCheck ? { type: 'check' } : illegal(`You can't check: there is a bet of ${state.betLevel} to call.`);
    case 'call':
      return legal.canCall ? { type: 'call' } : illegal('There is nothing to call. Check instead.');
    case 'bet':
      if (!legal.canBet) return illegal(state.betLevel > 0 ? 'There is already a bet. Raise instead.' : "You can't bet now.");
      return checkAmount('bet', amount as number, legal) ?? { type: 'bet', to: amount as number };
    case 'raise':
      if (!legal.canRaise) {
        return illegal(state.betLevel === 0 ? 'There is no bet to raise. Bet instead.' : "You can't raise now: you can only call or fold.");
      }
      return checkAmount('raise', amount as number, legal) ?? { type: 'raise', to: amount as number };
    case 'allIn': {
      const maxTo = p.committed + p.stack;
      if (maxTo <= state.betLevel) return { type: 'call' }; // calling already uses the whole stack
      if (legal.canBet) return { type: 'bet', to: maxTo };
      if (legal.canRaise) return { type: 'raise', to: maxTo };
      return illegal(legal.canCall ? "You can't raise now: you can only call or fold." : "You can't go all-in now.");
    }
    default:
      return illegal('Unknown action.');
  }
}

/** Moves chips so the player's street total becomes `to`. */
function commitTo(p: HandPlayer, to: number): void {
  const delta = to - p.committed;
  p.stack -= delta;
  p.committed = to;
  p.contributed += delta;
  if (p.stack === 0) p.status = 'allIn'; // R-4.6
}

/** Applies a validated action to the draft state and returns what was recorded. */
export function applyResolvedAction(state: HandState, p: HandPlayer, action: ResolvedAction): LastAction {
  let last: LastAction;
  switch (action.type) {
    case 'fold':
      p.status = 'folded';
      last = { type: 'fold', allIn: false };
      break;
    case 'check':
      last = { type: 'check', allIn: false };
      break;
    case 'call':
      commitTo(p, Math.min(state.betLevel, p.committed + p.stack));
      last = { type: 'call', amount: p.committed, allIn: p.status === 'allIn' };
      break;
    case 'bet':
    case 'raise': {
      const increase = action.to - state.betLevel;
      commitTo(p, action.to);
      state.betLevel = action.to;
      if (increase >= state.minRaise) {
        // R-4.4 full raise: it sets the new minimum and reopens action for everyone else.
        state.minRaise = increase;
        for (const other of state.players) if (other !== p && isActive(other)) other.hasActed = false;
      } // otherwise a short all-in: minRaise unchanged, action not reopened.
      last = { type: action.type, amount: action.to, allIn: p.status === 'allIn' };
      break;
    }
  }
  p.hasActed = true;
  p.betLevelWhenLastActed = state.betLevel;
  p.lastAction = last;
  return last;
}

/** R-5.5 and R-5.7: is this street's betting over? */
export function isRoundComplete(state: HandState): boolean {
  const active = state.players.filter(isActive);
  if (active.length === 0) return true;
  if (active.length === 1) {
    const [only] = active as [HandPlayer];
    const highestOther = Math.max(0, ...state.players.filter((q) => q !== only && notFolded(q)).map((q) => q.committed));
    if (only.committed >= highestOther) return true; // nobody left to bet against
  }
  return !active.some((p) => needsToAct(state, p));
}

/** The next player clockwise from `fromSeat` who still owes an action (R-5.1 – R-5.3). */
export function nextToAct(state: HandState, fromSeat: number): number | null {
  const seats = state.players.filter((p) => needsToAct(state, p)).map((p) => p.seat);
  return nextSeatClockwise(fromSeat, seats);
}
