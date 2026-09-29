import { BOT_LEVELS, type ActionIntent, type BotLevel, type Card } from '@poker/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRng, decide, type BotInput } from '../../src/bots';
import { CARD_CODE, fastRank } from '../../src/bots/fastRank';
import { estimateEquity, preflopScore } from '../../src/bots/handStrength';
import {
  FULL_DECK,
  advance,
  applyAction,
  createHand,
  evaluateHand,
  getLegalActions,
  toGameView,
  type HandState,
} from '../../src/engine';
import { act, newHand } from '../engine/helpers';
import { playMatch } from './match';

/** Bots (product-spec §3.7): hand strength helpers, legality, hidden information, strength and speed. */

const inputFor = (state: HandState, level: BotLevel): BotInput => {
  const actor = state.players.find((p) => p.seat === state.toActSeat);
  if (!actor) throw new Error('nobody to act');
  return { level, view: toGameView(state, actor.playerId), legal: getLegalActions(state, actor.playerId)!, bigBlind: state.bigBlind };
};

describe('hand strength', () => {
  it('fastRank ranks exactly like the engine evaluator (R-8)', () => {
    fc.assert(
      fc.property(fc.shuffledSubarray([...FULL_DECK], { minLength: 5, maxLength: 7 }), (cards) => {
        expect(fastRank(cards.map((c) => CARD_CODE.get(c)!), cards.length)).toBe(evaluateHand(cards).rankValue);
      }),
      { numRuns: 20_000 },
    );
  });

  it('fastRank handles the edge cases: wheel, steel wheel, two trips, three pairs, flush over straight', () => {
    const same = (hand: string) => {
      const cards = hand.split(' ') as Card[];
      expect(fastRank(cards.map((c) => CARD_CODE.get(c)!), cards.length)).toBe(evaluateHand(cards).rankValue);
    };
    ['As 2d 3c 4h 5s Kd Qc', 'As 2s 3s 4s 5s 6d 7c', 'Ks Kd Kc 7h 7s 7d 2c', 'Ks Kd 7h 7s 4d 4c Ac', '2h 5h 9h Jh Kh Qd Tc'].forEach(same);
  });

  it('scores starting hands with the Chen formula', () => {
    const score = (hand: string) => preflopScore(hand.split(' ') as [Card, Card]);
    expect(score('As Ad')).toBe(20);
    expect(score('Ks Kd')).toBe(16);
    expect(score('2s 2d')).toBe(5);
    expect(score('As Ks')).toBe(12);
    expect(score('As Kd')).toBe(10);
    expect(score('Ts 9s')).toBe(8);
    expect(score('Jd 9c')).toBe(6);
    expect(score('As 5s')).toBe(7);
    expect(score('7d 2c')).toBe(-1);
  });

  it('estimates equity from run-outs of the unseen cards only', () => {
    const rng = createRng(42);
    // Aces against one random hand win about 85% of the time.
    expect(estimateEquity(['As', 'Ad'], [], 1, 4000, rng)).toBeCloseTo(0.85, 1);
    // The nuts on the river can only tie... and here nothing can tie a royal flush.
    expect(estimateEquity(['As', 'Ks'], ['Qs', 'Js', 'Ts', '2d', '3c'], 3, 200, rng)).toBe(1);
    // A board that plays for everyone is a split for everyone.
    expect(estimateEquity(['2c', '3d'], ['As', 'Ks', 'Qs', 'Js', 'Ts'], 1, 200, rng)).toBe(0.5);
    // More opponents, less equity.
    const vsOne = estimateEquity(['Qh', 'Qd'], ['7c', '4s', '2h'], 1, 3000, rng);
    const vsFour = estimateEquity(['Qh', 'Qd'], ['7c', '4s', '2h'], 4, 3000, rng);
    expect(vsFour).toBeLessThan(vsOne - 0.1);
  });
});

/** A random hand: 2–5 players with mixed stack depths, random button, blinds and deck. */
const tableArb = fc.record({
  seats: fc.uniqueArray(fc.integer({ min: 0, max: 4 }), { minLength: 2, maxLength: 5 }),
  stackBySeat: fc.array(fc.oneof(fc.integer({ min: 1, max: 60 }), fc.integer({ min: 61, max: 5000 })), { minLength: 5, maxLength: 5 }),
  smallBlind: fc.integer({ min: 1, max: 25 }),
  bigBlindExtra: fc.integer({ min: 0, max: 25 }),
  buttonIndex: fc.nat(),
  deck: fc.shuffledSubarray([...FULL_DECK], { minLength: 52, maxLength: 52 }),
  levels: fc.array(fc.constantFrom(...BOT_LEVELS), { minLength: 5, maxLength: 5 }),
  seed: fc.nat(),
  /** Share of decisions made by a random legal action instead of the bot, to reach odder spots. */
  chaos: fc.constantFrom(0, 0.3, 0.7),
});
type Table = typeof tableArb extends fc.Arbitrary<infer T> ? T : never;

function randomLegal(state: HandState, rng: () => number): ActionIntent {
  const actor = state.players.find((p) => p.seat === state.toActSeat)!;
  const legal = getLegalActions(state, actor.playerId)!;
  const options: ActionIntent[] = [{ type: 'fold' }];
  if (legal.canCheck) options.push({ type: 'check' });
  if (legal.canCall) options.push({ type: 'call' });
  const to = legal.minTo + Math.floor(rng() * (legal.maxTo - legal.minTo + 1));
  if (legal.canBet) options.push({ type: 'bet', amount: to });
  if (legal.canRaise) options.push({ type: 'raise', amount: to });
  return options[Math.floor(rng() * options.length)] as ActionIntent;
}

/** Plays a random hand to the end; `onDecision` sees every state where someone has to act. */
function playRandomHand(table: Table, onDecision: (state: HandState, level: BotLevel) => ActionIntent): void {
  const rng = createRng(table.seed);
  let state = createHand({
    handId: 1,
    players: table.seats.map((seat) => ({ playerId: `p${seat}`, seat, stack: table.stackBySeat[seat] as number })),
    buttonSeat: table.seats[table.buttonIndex % table.seats.length] as number,
    smallBlind: table.smallBlind,
    bigBlind: table.smallBlind + table.bigBlindExtra,
    deck: table.deck,
  }).state;
  for (let step = 0; state.awaiting !== 'none'; step++) {
    if (step > 500) throw new Error('hand did not end');
    if (state.awaiting === 'deal') {
      state = advance(state).state;
      continue;
    }
    const level = table.levels[state.toActSeat as number] as BotLevel;
    const intent = rng() < table.chaos ? randomLegal(state, rng) : onDecision(state, level);
    const actor = state.players.find((p) => p.seat === state.toActSeat)!;
    const result = applyAction(state, actor.playerId, intent);
    if (!result.ok) throw new Error(`rejected ${JSON.stringify(intent)}: ${result.error.message}`);
    state = result.state;
  }
}

describe('decide()', () => {
  it('always returns an action the engine accepts, at both levels, in any reachable spot', () => {
    let decisions = 0;
    fc.assert(
      fc.property(tableArb, (table) => {
        const rng = createRng(table.seed + 1);
        playRandomHand(table, (state, level) => {
          const input = inputFor(state, level);
          const intent = decide(input, rng);
          const actor = state.players.find((p) => p.seat === state.toActSeat)!;
          const result = applyAction(state, actor.playerId, intent);
          if (!result.ok) throw new Error(`${level} bot chose ${JSON.stringify(intent)}: ${result.error.message}`);
          if (input.legal.canCheck && intent.type === 'fold') throw new Error('folded when checking was free');
          decisions++;
          return intent;
        });
      }),
      { numRuns: 1500 },
    );
    expect(decisions).toBeGreaterThan(3000);
  }, 60_000);

  it('sees no hidden information: other hole cards and the deck never change its decision', () => {
    fc.assert(
      fc.property(tableArb, fc.nat(), (table, reshuffle) => {
        playRandomHand(table, (state, level) => {
          const me = state.players.find((p) => p.seat === state.toActSeat)!;
          // Everything the bot can't see, dealt again in a different order.
          const visible = new Set<Card>([...me.holeCards, ...state.board]);
          const hidden = [...state.deck, ...state.players.filter((p) => p !== me).flatMap((p) => p.holeCards)];
          const shifted = hidden.map((_, i) => hidden[(i + 1 + (reshuffle % (hidden.length - 1))) % hidden.length] as Card);
          expect(shifted.some((card, i) => card !== hidden[i])).toBe(true);
          let next = 0;
          const other: HandState = {
            ...state,
            deck: state.deck.map(() => shifted[next++] as Card),
            players: state.players.map((p) => (p === me ? p : { ...p, holeCards: [shifted[next++] as Card, shifted[next++] as Card] })),
          };
          expect([...other.deck, ...other.players.flatMap((p) => p.holeCards)].some((c) => visible.has(c) && !me.holeCards.includes(c))).toBe(false);

          const seed = table.seed + state.seq;
          const a = decide(inputFor(state, level), createRng(seed));
          const b = decide(inputFor(other, level), createRng(seed));
          expect(b).toEqual(a);
          return a;
        });
      }),
      { numRuns: 300 },
    );
  }, 60_000);

  it('Medium raises aces preflop, folds seven-deuce to a raise, and never folds when it can check', () => {
    let raisedAces = 0;
    for (let seed = 0; seed < 200; seed++) {
      // Five-handed, the bot under the gun (seat 3, button 0) with aces; nobody has acted yet.
      const aces = newHand({ stacks: [1000, 1000, 1000, 1000, 1000], button: 0, hole: { 3: ['As', 'Ad'] } });
      if (decide(inputFor(aces, 'medium'), createRng(seed)).type === 'raise') raisedAces++;

      // Seven-deuce facing a raise to 60 from under the gun.
      const junk = act(
        newHand({ stacks: [1000, 1000, 1000, 1000, 1000], button: 0, hole: { 4: ['7d', '2c'] } }),
        3,
        'raise',
        60,
      );
      expect(decide(inputFor(junk, 'medium'), createRng(seed)).type).toBe('fold');
    }
    expect(raisedAces).toBeGreaterThan(190);
  });

  it('Easy plays loose and passive: calls a small raise with junk far more often than Medium', () => {
    let easyCalls = 0;
    let mediumCalls = 0;
    for (let seed = 0; seed < 300; seed++) {
      // Three-handed, button 0: the button raises to 30, the small blind folds, and the big blind
      // (seat 2) has nine-four.
      const raised = act(newHand({ stacks: [1000, 1000, 1000], button: 0, hole: { 2: ['9d', '4c'] } }), 0, 'raise', 30);
      const bb = inputFor(act(raised, 1, 'fold'), 'easy');
      expect(bb.view.players.find((p) => p.seat === 2)?.holeCards).toEqual(['9d', '4c']);
      if (decide(bb, createRng(seed)).type === 'call') easyCalls++;
      if (decide({ ...bb, level: 'medium' }, createRng(seed)).type === 'call') mediumCalls++;
    }
    expect(easyCalls).toBeGreaterThan(200);
    expect(mediumCalls).toBeLessThan(easyCalls / 3);
  });
});

describe('bot strength and speed', () => {
  it('Medium finishes well ahead of Easy over a long seeded match', () => {
    const levels: BotLevel[] = ['medium', 'easy', 'medium', 'easy'];
    const { net, hands } = playMatch(levels, 250, 1);
    const byLevel = (level: BotLevel) => net.reduce((sum, n, i) => (levels[i] === level ? sum + n : sum), 0);
    expect(hands).toBe(250);
    expect(net.reduce((a, b) => a + b, 0)).toBe(0); // chips only move between seats
    expect(byLevel('medium')).toBeGreaterThan(5000); // more than 5 starting stacks
  }, 60_000);

  it.each(['medium', 'pro'] as const)('makes a %s decision in well under 50 ms on average', (level) => {
    // Postflop spots are the slow ones (Monte Carlo). Collect a spread of them first.
    const spots: BotInput[] = [];
    fc.assert(
      fc.property(tableArb, (table) => {
        playRandomHand({ ...table, chaos: 0.3 }, (state, seatLevel) => {
          if (state.street !== 'preflop') spots.push(inputFor(state, level));
          return decide(inputFor(state, seatLevel), createRng(table.seed));
        });
      }),
      { numRuns: 400, seed: 7 },
    );
    const sample = spots.slice(0, 300);
    const rng = createRng(3);
    for (const input of sample.slice(0, 20)) decide(input, rng); // warm up the JIT
    const started = performance.now();
    for (const input of sample) decide(input, rng);
    const average = (performance.now() - started) / sample.length;
    expect(sample.length).toBeGreaterThan(100);
    expect(average).toBeLessThan(50);
  }, 60_000);
});
