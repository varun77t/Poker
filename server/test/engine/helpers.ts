import type { ActionIntent, ActionType, Card } from '@poker/shared';
import {
  FULL_DECK,
  advance,
  applyAction,
  createHand,
  forceFold,
  type EngineError,
  type HandState,
} from '../../src/engine';
import { clockwiseFrom } from '../../src/engine/seats';

/** Player ids are derived from seats so tests read naturally: seat 3 is "p3". */
export const pid = (seat: number) => `p${seat}`;

/** Recursively freezes a value. The engine must never mutate its input, so frozen input + strict mode = loud failure. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export interface DeckSpec {
  seats: number[];
  buttonSeat: number;
  /** Hole cards by seat; unspecified seats get filler cards. */
  hole?: Record<number, [Card, Card]>;
  /** Flop, turn, river in order; unspecified cards are filler. */
  board?: Card[];
}

/**
 * A deck that deals exactly the given cards: hole cards one at a time from the left of the button,
 * twice around (R-2.7), then burn + flop, burn + turn, burn + river (R-3.2).
 */
export function stackDeck({ seats, buttonSeat, hole = {}, board = [] }: DeckSpec): Card[] {
  const chosen = new Set<Card>([...Object.values(hole).flat(), ...board]);
  const filler = FULL_DECK.filter((c) => !chosen.has(c));
  const next = () => filler.shift() as Card;
  const order = clockwiseFrom(buttonSeat, seats);

  const deck: Card[] = [];
  for (let round = 0; round < 2; round++) for (const seat of order) deck.push(hole[seat]?.[round] ?? next());
  const b = (i: number) => board[i] ?? next();
  deck.push(next(), b(0), b(1), b(2), next(), b(3), next(), b(4));
  return [...deck, ...filler];
}

export interface HandSpec {
  /** Stack by seat. */
  stacks: Record<number, number>;
  button: number;
  blinds?: [number, number];
  hole?: Record<number, [Card, Card]>;
  board?: Card[];
  handId?: number;
}

export function newHand({ stacks, button, blinds = [5, 10], hole, board, handId = 1 }: HandSpec): HandState {
  const seats = Object.keys(stacks).map(Number);
  const { state } = createHand({
    handId,
    players: seats.map((seat) => ({ playerId: pid(seat), seat, stack: stacks[seat] as number })),
    buttonSeat: button,
    smallBlind: blinds[0],
    bigBlind: blinds[1],
    deck: stackDeck({ seats, buttonSeat: button, hole, board }),
  });
  return deepFreeze(state);
}

/** Applies an action that must be legal; the result is frozen for the next step. */
export function act(state: HandState, seat: number, type: ActionType, amount?: number): HandState {
  const intent: ActionIntent = amount === undefined ? { type } : { type, amount };
  const res = applyAction(state, pid(seat), intent);
  if (!res.ok) throw new Error(`seat ${seat} ${type} ${amount ?? ''}: ${res.error.code} ${res.error.message}`);
  return deepFreeze(res.state);
}

/** Applies an action that must be rejected, and returns the error. */
export function reject(state: HandState, seat: number, intent: ActionIntent): EngineError {
  const res = applyAction(state, pid(seat), intent);
  if (res.ok) throw new Error(`Expected seat ${seat} ${intent.type} to be rejected`);
  return res.error;
}

export function deal(state: HandState): HandState {
  return deepFreeze(advance(state).state);
}

/** Deals every remaining run-out street. */
export function runOut(state: HandState): HandState {
  let s = state;
  while (s.awaiting === 'deal') s = deal(s);
  return s;
}

export function fold(state: HandState, seat: number): HandState {
  return deepFreeze(forceFold(state, pid(seat)).state);
}

export const seatOf = (state: HandState, seat: number) => {
  const p = state.players.find((q) => q.seat === seat);
  if (!p) throw new Error(`No player at seat ${seat}`);
  return p;
};

export const stacks = (state: HandState) => Object.fromEntries(state.players.map((p) => [p.seat, p.stack]));
