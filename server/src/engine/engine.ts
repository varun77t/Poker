import { MAX_SEATS, type ActionIntent, type Card, type PlayerId, type PotResult, type Street } from '@poker/shared';
import {
  applyResolvedAction,
  findPlayer,
  getLegalActions,
  isActive,
  isRoundComplete,
  nextToAct,
  notFolded,
  playerAtSeat,
  resolveIntent,
} from './betting';
import { isCard } from './deck';
import { evaluateHand } from './evaluator';
import { buildPots, splitPot } from './pots';
import { clockwiseFrom, nextSeatClockwise } from './seats';
import type { ActionResult, CreateHandInput, EngineEvent, HandPlayer, HandState, HandValue, Transition } from './types';

/**
 * One hand of No-Limit Hold'em, as pure functions (docs/game-rules.md). Every function returns a
 * new state and never mutates its input: work happens on a structured clone ("draft").
 */

const NEXT_STREET: Partial<Record<Street, Street>> = { preflop: 'flop', flop: 'turn', turn: 'river' };

/** Accumulates events for one transition and appends them to the hand's public log. */
class Recorder {
  readonly events: EngineEvent[] = [];
  constructor(private readonly state: HandState) {}
  emit(event: EngineEvent): void {
    this.events.push(event);
    this.state.log.push(event);
  }
}

function validateInput(input: CreateHandInput): void {
  const { players, smallBlind, bigBlind, deck, buttonSeat } = input;
  const isChips = (n: number) => Number.isSafeInteger(n) && n > 0;
  if (!Number.isSafeInteger(input.handId) || input.handId < 0) throw new Error('handId must be a non-negative integer');
  if (players.length < 2 || players.length > MAX_SEATS) throw new Error('A hand needs 2–5 players (R-2.1)');
  if (!isChips(smallBlind) || !isChips(bigBlind) || smallBlind > bigBlind) throw new Error('Invalid blinds');
  const seats = new Set(players.map((p) => p.seat));
  if (seats.size !== players.length || new Set(players.map((p) => p.playerId)).size !== players.length) {
    throw new Error('Duplicate seats or players');
  }
  for (const p of players) {
    if (!Number.isInteger(p.seat) || p.seat < 0 || p.seat >= MAX_SEATS) throw new Error(`Invalid seat ${p.seat}`);
    if (!isChips(p.stack)) throw new Error(`Player at seat ${p.seat} is not eligible: stack ${p.stack} (R-2.1)`);
  }
  if (!seats.has(buttonSeat)) throw new Error('The button must be on an eligible seat (R-2.2)');
  const needed = players.length * 2 + 8; // hole cards + 3 burns + 5 board cards
  if (deck.length < needed || !deck.every(isCard) || new Set(deck).size !== deck.length) {
    throw new Error(`The deck needs at least ${needed} distinct valid cards`);
  }
}

/** Starts a hand: posts blinds, deals hole cards and finds the first player to act. */
export function createHand(input: CreateHandInput): Transition {
  validateInput(input);
  const sorted = [...input.players].sort((a, b) => a.seat - b.seat);
  const seats = sorted.map((p) => p.seat);
  const headsUp = sorted.length === 2;
  const sbSeat = headsUp ? input.buttonSeat : (nextSeatClockwise(input.buttonSeat, seats) as number); // R-2.4 / R-2.3
  const bbSeat = nextSeatClockwise(sbSeat, seats) as number;

  // R-2.7: one card at a time, starting left of the button, twice around.
  const deck = [...input.deck];
  const hole = new Map<number, Card[]>(seats.map((seat) => [seat, []]));
  for (let round = 0; round < 2; round++) {
    for (const seat of clockwiseFrom(input.buttonSeat, seats)) hole.get(seat)?.push(deck.shift() as Card);
  }

  const players: HandPlayer[] = sorted.map((p) => ({
    playerId: p.playerId,
    seat: p.seat,
    stack: p.stack,
    holeCards: hole.get(p.seat) as [Card, Card],
    status: 'active',
    committed: 0,
    contributed: 0,
    hasActed: false,
    betLevelWhenLastActed: 0,
    lastAction: null,
  }));

  const state: HandState = {
    handId: input.handId,
    seq: 0,
    totalChips: players.reduce((sum, p) => sum + p.stack, 0),
    smallBlind: input.smallBlind,
    bigBlind: input.bigBlind,
    buttonSeat: input.buttonSeat,
    sbSeat,
    bbSeat,
    street: 'preflop',
    awaiting: 'action',
    deck,
    board: [],
    players,
    // R-2.6: the full big blind is the level to call, even if the big blind was short.
    betLevel: input.bigBlind,
    minRaise: input.bigBlind,
    toActSeat: null,
    allRevealed: false,
    result: null,
    log: [],
  };

  const rec = new Recorder(state);
  rec.emit({ type: 'handStarted', handId: state.handId, buttonSeat: state.buttonSeat, sbSeat, bbSeat });
  postBlind(state, rec, sbSeat, 'small', input.smallBlind);
  postBlind(state, rec, bbSeat, 'big', input.bigBlind);
  settle(state, rec, bbSeat); // R-5.1: first to act is left of the big blind
  return { state, events: rec.events };
}

/** R-2.5: post min(blind, stack); an emptied stack is all-in. Posting is not acting (R-5.6). */
function postBlind(state: HandState, rec: Recorder, seat: number, blind: 'small' | 'big', size: number): void {
  const p = playerAtSeat(state, seat);
  const amount = Math.min(size, p.stack);
  p.stack -= amount;
  p.committed = amount;
  p.contributed = amount;
  if (p.stack === 0) p.status = 'allIn';
  rec.emit({ type: 'blindPosted', seat, blind, amount, allIn: p.status === 'allIn' });
}

/** Applies a player's intent. Illegal intents return a typed error and change nothing. */
export function applyAction(state: HandState, playerId: PlayerId, intent: ActionIntent): ActionResult {
  if (state.awaiting !== 'action') {
    const message = state.awaiting === 'none' ? 'This hand is over.' : 'Wait for the next cards.';
    return { ok: false, error: { code: 'INVALID_STATE', message } };
  }
  const player = findPlayer(state, playerId);
  if (!player) return { ok: false, error: { code: 'NOT_YOUR_TURN', message: 'You are not in this hand.' } };
  if (player.status !== 'active') {
    const message = player.status === 'folded' ? 'You have folded this hand.' : 'You are all-in.';
    return { ok: false, error: { code: 'NOT_YOUR_TURN', message } };
  }
  if (player.seat !== state.toActSeat) return { ok: false, error: { code: 'NOT_YOUR_TURN', message: "It's not your turn." } };

  const legal = getLegalActions(state, playerId);
  if (!legal) throw new Error('Player to act has no legal actions');
  const resolved = resolveIntent(state, player, legal, intent);
  if ('code' in resolved) return { ok: false, error: resolved };

  const draft = structuredClone(state);
  const rec = new Recorder(draft);
  const actor = playerAtSeat(draft, player.seat);
  const action = applyResolvedAction(draft, actor, resolved);
  rec.emit({ type: 'action', seat: actor.seat, action });
  draft.seq += 1;
  settle(draft, rec, actor.seat);
  return { ok: true, state: draft, events: rec.events };
}

/** Deals the next street (or the next run-out card). Only valid while `awaiting === 'deal'`. */
export function advance(state: HandState): Transition {
  if (state.awaiting !== 'deal') throw new Error(`advance() called while awaiting '${state.awaiting}'`);
  const next = NEXT_STREET[state.street];
  if (!next) throw new Error(`No street after ${state.street}`);

  const draft = structuredClone(state);
  const rec = new Recorder(draft);
  draft.deck.shift(); // R-3.2 burn
  const cards = draft.deck.splice(0, next === 'flop' ? 3 : 1);
  draft.board.push(...cards);
  draft.street = next;
  draft.seq += 1;
  rec.emit({ type: 'streetDealt', street: next, cards });

  if (draft.allRevealed) {
    // R-5.8 run-out: no betting, keep dealing until the river, then showdown.
    if (next === 'river') showdown(draft, rec);
  } else {
    for (const p of draft.players) if (isActive(p)) p.lastAction = null;
    settle(draft, rec, draft.buttonSeat); // R-5.2: first to act is left of the button
  }
  return { state: draft, events: rec.events };
}

/**
 * R-9.1 (controller-only, e.g. a player leaving): folds an active player even out of turn. An
 * all-in player keeps their chips in; folded players and finished hands are unchanged.
 */
export function forceFold(state: HandState, playerId: PlayerId): Transition {
  const target = findPlayer(state, playerId);
  if (!target || target.status !== 'active' || state.awaiting === 'none') return { state, events: [] };

  const draft = structuredClone(state);
  const rec = new Recorder(draft);
  const p = playerAtSeat(draft, target.seat);
  const wasTheirTurn = draft.toActSeat === p.seat;
  p.status = 'folded';
  p.lastAction = { type: 'fold', allIn: false };
  draft.seq += 1;
  rec.emit({ type: 'forcedFold', seat: p.seat });

  if (draft.players.filter(notFolded).length === 1) {
    endByFolds(draft, rec);
  } else if (draft.awaiting === 'action') {
    if (isRoundComplete(draft)) completeRound(draft, rec);
    else if (wasTheirTurn) draft.toActSeat = nextToAct(draft, p.seat);
  } else if (!draft.allRevealed && draft.players.filter(isActive).length <= 1) {
    // Between streets, and now nobody can bet: the rest is a run-out (R-5.8).
    revealAll(draft, rec);
  }
  return { state: draft, events: rec.events };
}

/** After blinds, an action, or a new street: end the hand, close the round, or pass the turn. */
function settle(state: HandState, rec: Recorder, fromSeat: number): void {
  if (state.players.filter(notFolded).length === 1) return endByFolds(state, rec); // R-5.4
  if (isRoundComplete(state)) return completeRound(state, rec);
  state.awaiting = 'action';
  state.toActSeat = nextToAct(state, fromSeat);
}

/** A street's betting is over (R-3.3). */
function completeRound(state: HandState, rec: Recorder): void {
  returnUncalled(state, rec);
  for (const p of state.players) {
    p.committed = 0;
    p.hasActed = false;
    p.betLevelWhenLastActed = 0;
  }
  state.betLevel = 0;
  state.minRaise = state.bigBlind;
  state.toActSeat = null;
  rec.emit({ type: 'bettingClosed', street: state.street });

  if (!state.allRevealed && state.players.filter(isActive).length <= 1) revealAll(state, rec); // R-5.7 / R-5.8
  if (state.street === 'river') return showdown(state, rec);
  state.awaiting = 'deal';
}

function revealAll(state: HandState, rec: Recorder): void {
  state.allRevealed = true;
  rec.emit({ type: 'handsRevealed', seats: state.players.filter(notFolded).map((p) => p.seat) });
}

/** R-6.2: chips nobody matched go straight back to the player who put them in. */
function returnUncalled(state: HandState, rec: Recorder): void {
  const { uncalled } = buildPots(potInputs(state));
  if (!uncalled) return;
  const p = playerAtSeat(state, uncalled.seat);
  p.stack += uncalled.amount;
  p.contributed -= uncalled.amount;
  p.committed = Math.max(0, p.committed - uncalled.amount);
  if (p.status === 'allIn') p.status = 'active'; // they have chips again, but nobody is left to bet against
  rec.emit({ type: 'uncalledReturned', seat: p.seat, amount: uncalled.amount });
}

const potInputs = (state: HandState) =>
  state.players.map((p) => ({ seat: p.seat, contributed: p.contributed, folded: p.status === 'folded' }));

/**
 * R-5.4 / R-7.4: everyone else folded. After unmatched chips go back (R-6.2), the last player takes
 * everything in the middle as one pot and shows nothing. That includes chips they could never have
 * won at a showdown, e.g. the blinds when both blinds leave before the button has acted.
 */
function endByFolds(state: HandState, rec: Recorder): void {
  returnUncalled(state, rec);
  const winner = state.players.find(notFolded) as HandPlayer;
  const amount = state.players.reduce((sum, p) => sum + p.contributed, 0);
  winner.stack += amount;
  rec.emit({ type: 'potAwarded', potIndex: 0, amount, winners: [{ seat: winner.seat, amount }] });
  state.result = {
    wonByFold: true,
    pots: [{ amount, eligibleSeats: [winner.seat], winners: [{ seat: winner.seat, playerId: winner.playerId, amount }] }],
    shown: [],
  };
  finish(state, rec, true);
}

/** R-7: every pot goes to its best eligible hand(s); ties split with odd chips left of the button. */
function showdown(state: HandState, rec: Recorder): void {
  state.street = 'showdown';
  state.toActSeat = null;
  if (!state.allRevealed) revealAll(state, rec);

  const contenders = state.players.filter(notFolded);
  const values = new Map<number, HandValue>(contenders.map((p) => [p.seat, evaluateHand([...p.holeCards, ...state.board])]));
  const { pots, anomalies, unclaimed } = buildPots(potInputs(state));
  // Everyone at a showdown put chips in, so the lowest pot always has an eligible player.
  if (unclaimed > 0) throw new Error(`${unclaimed} chips have no eligible player at showdown`);
  if (anomalies > 0) rec.emit({ type: 'deadChipsMerged', layers: anomalies });

  const results: PotResult[] = pots.map((pot, potIndex) => {
    const best = Math.max(...pot.eligibleSeats.map((seat) => (values.get(seat) as HandValue).rankValue));
    const winnerSeats = pot.eligibleSeats.filter((seat) => (values.get(seat) as HandValue).rankValue === best);
    const shares = splitPot(pot.amount, winnerSeats, state.buttonSeat);
    for (const share of shares) playerAtSeat(state, share.seat).stack += share.amount;
    rec.emit({ type: 'potAwarded', potIndex, amount: pot.amount, winners: shares });
    return {
      ...pot,
      winners: shares.map((s) => ({ seat: s.seat, playerId: playerAtSeat(state, s.seat).playerId, amount: s.amount })),
    };
  });

  state.result = {
    wonByFold: false,
    pots: results,
    shown: contenders.map((p) => {
      const value = values.get(p.seat) as HandValue;
      return {
        seat: p.seat,
        playerId: p.playerId,
        holeCards: p.holeCards,
        best5: value.best5,
        category: value.category,
        label: value.label,
      };
    }),
  };
  finish(state, rec, false);
}

function finish(state: HandState, rec: Recorder, wonByFold: boolean): void {
  state.awaiting = 'none';
  state.toActSeat = null;
  rec.emit({ type: 'handEnded', wonByFold });
  const total = state.players.reduce((sum, p) => sum + p.stack, 0);
  // R-7.6: a mismatch is an engine bug; never let it reach the table.
  if (total !== state.totalChips) throw new Error(`Chip conservation violated: ${total} !== ${state.totalChips}`);
}
