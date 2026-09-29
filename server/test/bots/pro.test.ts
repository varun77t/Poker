import type { BotLevel, Card } from '@poker/shared';
import { describe, expect, it } from 'vitest';
import { createRng, decide, type BotInput, type PlayerRead } from '../../src/bots';
import { lineOf, rangeEquity, rangeWeight } from '../../src/bots/ranges';
import { tendencies } from '../../src/bots/reads';
import { getLegalActions, toGameView, type HandState } from '../../src/engine';
import { act, deal, newHand } from '../engine/helpers';
import { playMatch } from './match';

/**
 * The Pro bot (product-spec §3.7): it reads ranges from betting lines and player tendencies, folds
 * when the line says it's beaten, bluffs players who fold and value bets players who don't.
 * Heads-up hands: seat 0 is the button (small blind), seat 1 the big blind.
 */

const reads = (read: PlayerRead) => new Map([['p1', read]]);
/** Folds a lot, raises little, rarely bets without a hand. */
const NIT: PlayerRead = { hands: 60, vpip: 8, pfr: 4, bets: 8, calls: 6, folds: 30 };
/** Calls nearly everything. */
const STATION: PlayerRead = { hands: 60, vpip: 50, pfr: 1, bets: 3, calls: 60, folds: 3 };
/** Raises and bets all the time. */
const MANIAC: PlayerRead = { hands: 60, vpip: 40, pfr: 30, bets: 70, calls: 10, folds: 8 };

const inputFor = (state: HandState, level: BotLevel, read: Map<string, PlayerRead>): BotInput => {
  const actor = state.players.find((p) => p.seat === state.toActSeat)!;
  return { level, view: toGameView(state, actor.playerId), legal: getLegalActions(state, actor.playerId)!, bigBlind: 10, reads: read };
};

/** Counts how often each kind of action comes out over `n` seeds. */
function tally(input: BotInput, n = 300): Record<string, number> {
  const counts: Record<string, number> = {};
  for (let seed = 1; seed <= n; seed++) {
    const { type } = decide(input, createRng(seed));
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return counts;
}

/** Pro raised pre-flop and was called; everyone checks to Pro on the river. Pro has nothing but three-high. */
function riverCheckedToPro(): HandState {
  let s = newHand({
    stacks: { 0: 1000, 1: 1000 },
    button: 0,
    hole: { 0: ['3c', '2d'], 1: ['8h', '8d'] },
    board: ['Ah', 'Kd', '9s', '7c', 'Jh'],
  });
  s = act(act(s, 0, 'raise', 30), 1, 'call');
  for (let street = 0; street < 2; street++) s = act(act(deal(s), 1, 'check'), 0, 'check');
  return act(deal(s), 1, 'check');
}

/** The big blind re-raised, then bet flop, turn and a big river. Pro has middle pair. */
function tripleBarrelIntoPro(): HandState {
  let s = newHand({
    stacks: { 0: 1000, 1: 1000 },
    button: 0,
    hole: { 0: ['8h', '9h'], 1: ['Ac', 'Kc'] },
    board: ['Kh', '8d', '4c', '2s', 'Jd'],
  });
  s = act(act(act(s, 0, 'raise', 30), 1, 'raise', 90), 0, 'call');
  s = act(act(deal(s), 1, 'bet', 100), 0, 'call');
  s = act(act(deal(s), 1, 'bet', 200), 0, 'call');
  return act(deal(s), 1, 'bet', 400);
}

describe('Pro reads ranges', () => {
  it('narrows a tight re-raiser who bets every street to strong hands', () => {
    const s = tripleBarrelIntoPro();
    const line = lineOf(1, toGameView(s, 'p0').history);
    expect(line).toEqual({ preflop: 'reraiser', streets: ['raise', 'raise', 'raise'] });
    const hole: [Card, Card] = ['8h', '9h'];
    const vsNit = rangeEquity(hole, s.board, [rangeWeight(line, tendencies(NIT), s.board)], 3000, createRng(1));
    const vsManiac = rangeEquity(hole, s.board, [rangeWeight(line, tendencies(MANIAC), s.board)], 3000, createRng(1));
    expect(vsNit).toBeLessThan(0.15);
    expect(vsManiac).toBeGreaterThan(vsNit + 0.15);
  });
});

describe('Pro decisions', () => {
  it('folds middle pair to a tight player’s triple barrel, but calls a maniac more often', () => {
    const s = tripleBarrelIntoPro();
    const vsNit = tally(inputFor(s, 'pro', reads(NIT)));
    const vsManiac = tally(inputFor(s, 'pro', reads(MANIAC)));
    expect(vsNit.fold ?? 0).toBeGreaterThan(290);
    expect(vsManiac.call ?? 0).toBeGreaterThan(150);
  }, 60_000);

  it('bluffs a river checked to it against a player who folds, and hardly ever against one who calls everything', () => {
    const s = riverCheckedToPro();
    const bluffsVsNit = tally(inputFor(s, 'pro', reads(NIT))).bet ?? 0;
    const bluffsVsStation = tally(inputFor(s, 'pro', reads(STATION))).bet ?? 0;
    expect(bluffsVsNit).toBeGreaterThan(120);
    expect(bluffsVsStation).toBeLessThan(40);
  }, 60_000);

  it('always bets the nuts on the river for value, bigger against a calling station', () => {
    let s = newHand({
      stacks: { 0: 1000, 1: 1000 },
      button: 0,
      hole: { 0: ['9h', 'Th'], 1: ['8c', '8d'] },
      board: ['Jh', 'Qh', 'Kh', '2c', '3d'],
    });
    s = act(act(s, 0, 'raise', 30), 1, 'call');
    for (let street = 0; street < 2; street++) s = act(act(deal(s), 1, 'check'), 0, 'check');
    s = act(deal(s), 1, 'check');
    const sizes = (read: PlayerRead) => {
      const amounts: number[] = [];
      for (let seed = 1; seed <= 100; seed++) {
        const intent = decide(inputFor(s, 'pro', reads(read)), createRng(seed));
        expect(intent.type).toBe('bet');
        amounts.push(intent.amount!);
      }
      return amounts.reduce((a, b) => a + b, 0) / amounts.length;
    };
    expect(sizes(STATION)).toBeGreaterThan(sizes(NIT));
  }, 60_000);

  it('raises aces and folds seven-deuce to a raise before the flop', () => {
    for (let seed = 0; seed < 100; seed++) {
      const aces = newHand({ stacks: { 0: 1000, 1: 1000, 2: 1000, 3: 1000, 4: 1000 }, button: 0, hole: { 3: ['As', 'Ad'] } });
      expect(decide(inputFor(aces, 'pro', new Map()), createRng(seed)).type).toBe('raise');
      const junk = act(
        newHand({ stacks: { 0: 1000, 1: 1000, 2: 1000, 3: 1000, 4: 1000 }, button: 0, hole: { 4: ['7d', '2c'] } }),
        3,
        'raise',
        30,
      );
      expect(decide(inputFor(junk, 'pro', new Map()), createRng(seed)).type).toBe('fold');
    }
  }, 60_000);
});

describe('Pro strength', () => {
  it('beats Medium heads-up over seeded matches, from both seats', () => {
    let pro = 0;
    for (let seed = 1; seed <= 3; seed++) {
      pro += playMatch(['pro', 'medium'], 200, seed * 101).net[0]!;
      pro += playMatch(['medium', 'pro'], 200, seed * 103).net[1]!;
    }
    expect(pro).toBeGreaterThan(3000); // over 1,200 hands: comfortably ahead
  }, 120_000);
});
