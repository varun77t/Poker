import type { ActionIntent, ActionType, LegalActions } from '@poker/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  FULL_DECK,
  advance,
  applyAction,
  createHand,
  forceFold,
  getLegalActions,
  toGameView,
  type HandState,
} from '../../src/engine';
import { deepFreeze, pid } from './helpers';

/**
 * R-7.6 and friends: random tables and random (legal and illegal) action sequences. Checked after
 * every step: chips conserved, no negative stacks, consistent turn state, no hidden card in any
 * view. And every hand terminates.
 */

const ACTION_TYPES: ActionType[] = ['fold', 'check', 'call', 'bet', 'raise', 'allIn'];
const BOARD_SIZE = { preflop: 0, flop: 3, turn: 4, river: 5, showdown: 5 } as const;
const MAX_STEPS = 10_000;
/** Raise for a longer soak, e.g. ENGINE_PROPERTY_RUNS=50000 npm test -w @poker/server. */
const RUNS = Number(process.env.ENGINE_PROPERTY_RUNS ?? 1500);

const tableArb = fc.record({
  seats: fc.uniqueArray(fc.integer({ min: 0, max: 4 }), { minLength: 2, maxLength: 5 }),
  // Plenty of short stacks, so blinds all-in, side pots and run-outs are common.
  stackBySeat: fc.array(fc.oneof(fc.integer({ min: 1, max: 40 }), fc.integer({ min: 41, max: 3000 })), {
    minLength: 5,
    maxLength: 5,
  }),
  smallBlind: fc.integer({ min: 1, max: 25 }),
  bigBlindExtra: fc.integer({ min: 0, max: 25 }),
  buttonIndex: fc.nat(),
  deck: fc.shuffledSubarray([...FULL_DECK], { minLength: 52, maxLength: 52 }),
  seed: fc.array(fc.nat(), { minLength: 64, maxLength: 64 }),
  /** Calm hands rarely shove, so they play out over several streets of ordinary betting. */
  calm: fc.boolean(),
});

type Table = typeof tableArb extends fc.Arbitrary<infer T> ? T : never;

/** Cheap assertion for per-step invariants (expect() is too slow for tens of thousands of steps). */
function check(condition: boolean, message: () => string, s: HandState): void {
  if (!condition) throw new Error(`${message()}\nstate: ${JSON.stringify({ ...s, deck: undefined, log: s.log.slice(-8) })}`);
}

function checkState(s: HandState): void {
  const sum = (f: (p: HandState['players'][number]) => number) => s.players.reduce((acc, p) => acc + f(p), 0);
  if (s.awaiting === 'none') {
    check(sum((p) => p.stack) === s.totalChips, () => 'chips not conserved after the hand', s);
    const result = s.result;
    check(result !== null, () => 'finished hand has no result', s);
    const potTotal = result!.pots.reduce((acc, pot) => acc + pot.amount, 0);
    check(potTotal === sum((p) => p.contributed), () => 'pots do not add up to contributions', s);
    for (const pot of result!.pots) {
      check(pot.winners.every((w) => pot.eligibleSeats.includes(w.seat)), () => 'winner not eligible', s);
      check(pot.winners.reduce((acc, w) => acc + w.amount, 0) === pot.amount, () => 'pot not fully paid', s);
    }
  } else {
    check(sum((p) => p.stack + p.contributed) === s.totalChips, () => 'chips not conserved during the hand', s);
  }

  for (const p of s.players) {
    check(Number.isSafeInteger(p.stack) && p.stack >= 0, () => `bad stack at seat ${p.seat}`, s);
    check(p.committed >= 0 && p.committed <= p.contributed, () => `bad committed at seat ${p.seat}`, s);
    if (s.awaiting !== 'none') {
      // Until pots are paid out, all-in means no chips left and active means some left.
      check(p.status !== 'allIn' || p.stack === 0, () => `all-in with chips at seat ${p.seat}`, s);
      check(p.status !== 'active' || p.stack > 0, () => `active without chips at seat ${p.seat}`, s);
    }
    if (s.awaiting === 'action') check(p.committed <= s.betLevel, () => `committed above bet level at seat ${p.seat}`, s);
  }

  if (s.awaiting === 'action') {
    const actor = s.players.find((p) => p.seat === s.toActSeat);
    check(actor?.status === 'active', () => 'player to act is not active', s);
    check(getLegalActions(s, actor!.playerId) !== null, () => 'player to act has no legal actions', s);
  } else {
    check(s.toActSeat === null, () => 'toActSeat set while not awaiting action', s);
  }
  if (s.awaiting === 'deal') check(s.board.length < 5, () => 'waiting to deal with a full board', s);
  if (s.awaiting !== 'none' || !s.result?.wonByFold) {
    check(s.board.length === BOARD_SIZE[s.street], () => `board has ${s.board.length} cards on the ${s.street}`, s);
  }

  const allCards = [...s.deck, ...s.board, ...s.players.flatMap((p) => p.holeCards)];
  check(new Set(allCards).size === allCards.length, () => 'duplicate cards', s);
}

const CARD_TOKEN = /"[2-9TJQKA][cdhs]"/g;

function checkViews(s: HandState): void {
  for (const viewer of [...s.players.map((p) => p.playerId), 'spectator']) {
    const view = toGameView(s, viewer);
    if (s.awaiting !== 'none') {
      // Displayed pots plus this street's bets account for every chip put in (R-6.5).
      const shown = view.pots.reduce((acc, pot) => acc + pot.amount, 0) + view.players.reduce((acc, p) => acc + p.committed, 0);
      check(shown === s.players.reduce((acc, p) => acc + p.contributed, 0), () => 'displayed pots do not add up', s);
    }
    // Every card string anywhere in what this viewer would receive.
    const visible = new Set(JSON.stringify(view).match(CARD_TOKEN)?.map((t) => t.slice(1, 3)));
    for (const card of s.deck) check(!visible.has(card), () => `${viewer} can see deck card ${card}`, s);
    for (const p of s.players) {
      if (p.playerId === viewer || (s.allRevealed && p.status !== 'folded')) continue;
      for (const card of p.holeCards) check(!visible.has(card), () => `${viewer} can see ${p.playerId}'s ${card}`, s);
    }
  }
}

/** A random intent: usually one of the legal options, sometimes arbitrary junk. */
function chooseIntent(legal: LegalActions, calm: boolean, rnd: (n: number) => number): ActionIntent {
  if (rnd(8) === 0) {
    const type = ACTION_TYPES[rnd(ACTION_TYPES.length)] as ActionType;
    return rnd(2) === 0 ? { type } : { type, amount: rnd(6000) - 100 };
  }
  const anyAmount = () => legal.minTo + rnd(legal.maxTo - legal.minTo + 1);
  const amount = () =>
    calm ? [legal.minTo, Math.min(legal.maxTo, legal.minTo * 2)][rnd(2)] as number : ([legal.minTo, legal.maxTo, anyAmount()][rnd(3)] as number);
  const options: ActionIntent[] = [{ type: 'fold' }];
  const passive = calm ? 6 : 3;
  for (let i = 0; i < passive; i++) {
    if (legal.canCheck) options.push({ type: 'check' });
    if (legal.canCall) options.push({ type: 'call' });
  }
  if (legal.canBet) options.push({ type: 'bet', amount: amount() });
  if (legal.canRaise) options.push({ type: 'raise', amount: amount() });
  if (!calm && (legal.canBet || legal.canRaise)) options.push({ type: 'allIn' });
  return options[rnd(options.length)] as ActionIntent;
}

function playHand(table: Table): { state: HandState; forcedFolds: number } {
  let tapeIndex = 0;
  const rnd = (n: number) => (table.seed[tapeIndex++ % table.seed.length]! + tapeIndex * 7919) % n;

  let state = deepFreeze(
    createHand({
      handId: 1,
      players: table.seats.map((seat) => ({ playerId: pid(seat), seat, stack: table.stackBySeat[seat] as number })),
      buttonSeat: table.seats[table.buttonIndex % table.seats.length] as number,
      smallBlind: table.smallBlind,
      bigBlind: table.smallBlind + table.bigBlindExtra,
      deck: table.deck,
    }).state,
  );
  let forcedFolds = 0;
  let revealed = false;
  let step = 0;

  for (; step < MAX_STEPS && state.awaiting !== 'none'; step++) {
    checkState(state);
    checkViews(state);
    check(state.allRevealed || !revealed, () => 'hands were hidden again after being revealed', state);
    revealed = state.allRevealed;
    const seqBefore = state.seq;

    if (state.awaiting === 'deal') {
      state = deepFreeze(advance(state).state);
    } else if (rnd(25) === 0) {
      // Someone leaves mid-hand (R-9.1), possibly out of turn.
      const target = state.players[rnd(state.players.length)]!;
      const next = forceFold(state, target.playerId).state;
      if (next !== state) forcedFolds++;
      state = deepFreeze(next);
      continue;
    } else {
      const actor = state.players.find((p) => p.seat === state.toActSeat)!;
      const res = applyAction(state, actor.playerId, chooseIntent(getLegalActions(state, actor.playerId)!, table.calm, rnd));
      if (!res.ok) continue; // rejected: the frozen state is untouched
      state = deepFreeze(res.state);
    }
    check(state.seq > seqBefore, () => 'seq did not increase', state);
  }

  expect(state.awaiting).toBe('none'); // every hand terminates
  checkState(state);
  checkViews(state);
  return { state, forcedFolds };
}

describe('engine property tests (R-7.6)', () => {
  it('conserves chips, never goes negative, always terminates and never leaks cards', () => {
    fc.assert(
      fc.property(tableArb, (table) => {
        const { state, forcedFolds } = playHand(table);
        // R-6.4 can only happen after a forced fold (a player leaving); normal play never triggers it.
        if (forcedFolds === 0) expect(state.log.some((e) => e.type === 'deadChipsMerged')).toBe(false);
      }),
      { numRuns: RUNS },
    );
  }, 120_000 + RUNS * 20);
});
