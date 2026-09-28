import type { Card, HandCategory } from '@poker/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FULL_DECK, evaluateHand } from '../../src/engine';

const hand = (s: string) => s.split(' ') as Card[];
const ev = (s: string) => evaluateHand(hand(s));

describe('evaluateHand: categories and labels (R-8.1, R-8.2)', () => {
  it.each([
    ['As Ks Qs Js Ts 2d 3c', 'straightFlush', 'Royal Flush'],
    ['9h 8h 7h 6h 5h Kd 2c', 'straightFlush', 'Straight Flush, Nine high'],
    ['Ad 2d 3d 4d 5d Kc Qs', 'straightFlush', 'Straight Flush, Five high'], // steel wheel
    ['Qc Qd Qh Qs 2c 3d 9h', 'quads', 'Four of a Kind, Queens'],
    ['Kc Kd Kh 7s 7d 2c 3c', 'fullHouse', 'Full House, Kings over Sevens'],
    ['9c 9d 9h 5s 5d 5h Ac', 'fullHouse', 'Full House, Nines over Fives'], // two sets of trips
    ['Ah Th 7h 4h 2h Kd Qc', 'flush', 'Flush, Ace high'],
    ['Td 9c 8h 7s 6d 2c 2d', 'straight', 'Straight, Ten high'],
    ['Ac 2d 3h 4s 5c Kd 9h', 'straight', 'Straight, Five high'], // wheel
    ['4c 4d 4h Ks 9d 2c 7h', 'trips', 'Three of a Kind, Fours'],
    ['Ac Ad 9h 9s Kd 2c 3h', 'twoPair', 'Two Pair, Aces and Nines'],
    ['Jc Jd 9h 7s 3d 2c 4h', 'pair', 'Pair of Jacks'],
    ['Ac Qd 9h 7s 3d 2c 4h', 'highCard', 'High Card, Ace'],
    ['Qc Kd Ah 2s 3c 8d 9h', 'highCard', 'High Card, Ace'], // Q-K-A-2-3 does not wrap around
  ])('%s → %s', (cards, category, label) => {
    const value = ev(cards);
    expect(value.category).toBe(category);
    expect(value.label).toBe(label);
    expect(value.best5).toHaveLength(5);
  });

  it('ranks categories in order', () => {
    const ascending = [
      'Ac Qd 9h 7s 3d 2c 4h',
      'Jc Jd 9h 7s 3d 2c 4h',
      'Ac Ad 9h 9s Kd 2c 3h',
      '4c 4d 4h Ks 9d 2c 7h',
      'Ac 2d 3h 4s 5c Kd 9h',
      'Ah Th 7h 4h 2h Kd Qc',
      'Kc Kd Kh 7s 7d 2c 3c',
      'Qc Qd Qh Qs 2c 3d 9h',
      'Ad 2d 3d 4d 5d Kc Qs',
      'As Ks Qs Js Ts 2d 3c',
    ].map((cards) => ev(cards).rankValue);
    expect([...ascending].sort((a, b) => a - b)).toEqual(ascending);
    expect(new Set(ascending).size).toBe(ascending.length);
  });
});

describe('evaluateHand: tie-breaks', () => {
  const beats = (a: string, b: string) => expect(ev(a).rankValue).toBeGreaterThan(ev(b).rankValue);
  const ties = (a: string, b: string) => expect(ev(a).rankValue).toBe(ev(b).rankValue);

  it('compares kickers', () => {
    beats('Ac Ad Kh 7s 3d', 'Ac Ad Qh 7s 3d'); // pair, first kicker
    beats('Ac Ad Kh 8s 3d', 'Ah As Kd 7s 3c'); // pair, second kicker
    beats('Ac Ad 9h 9s Kd', 'Ah As 9d 9c Qd'); // two pair kicker
    beats('Ac Ad 9h 9s 2d', 'Kh Ks Qd Qc Jd'); // high pair first
    beats('Qc Qd Qh Qs Kd', 'Qc Qd Qh Qs Jd'); // quads kicker
    beats('Kc Kd Kh 2s 2d', 'Qc Qd Qh As Ad'); // full house: trips first
    beats('Ah Kh 9h 5h 3h', 'As Ks 9s 5s 2s'); // flush: all five cards
    beats('6c 5d 4h 3s 2c', 'Ac 2d 3h 4s 5c'); // six-high straight beats the wheel
  });

  it('plays the best two of three pairs, with the best remaining kicker', () => {
    const value = ev('Ac Ad Kc Kd Qc Qd 2h');
    expect(value.label).toBe('Two Pair, Aces and Kings');
    ties('Ac Ad Kc Kd Qc Qd 2h', 'Ah As Kh Ks Qh 3c 2d');
  });

  it('only the best five cards count (R-8.4, R-8.5)', () => {
    // Board A A K K Q: both players' jacks are too low to play, so they tie.
    ties('Ah Ad Kh Kd Qc Jc 2s', 'Ah Ad Kh Kd Qc Js 3s');
    // A board straight plays for everyone.
    ties('5c 6d 7h 8s 9c 2c 3d', '5c 6d 7h 8s 9c 2h 3h');
  });

  it('never uses suits to break ties (R-8.3)', () => {
    ties('Ah Th 7h 4h 2h', 'As Ts 7s 4s 2s');
  });

  it('prefers a straight flush over a higher plain straight and a flush', () => {
    const value = ev('9h 8h 7h 6h 5h Td Jc');
    expect(value.category).toBe('straightFlush');
    expect(value.label).toBe('Straight Flush, Nine high');
  });
});

describe('evaluateHand: input validation', () => {
  it('needs 5–7 distinct, valid cards', () => {
    expect(() => ev('Ac Kd Qh Js')).toThrow();
    expect(() => ev('Ac Kd Qh Js Tc 9c 8c 7c')).toThrow();
    expect(() => ev('Ac Ac Qh Js Tc')).toThrow();
    expect(() => evaluateHand(['Ac', 'Kd', 'Qh', 'Js', 'Xx' as Card])).toThrow();
  });
});

// --- Property tests against an independent, deliberately naive reference ---------------------------

const CATEGORIES: HandCategory[] = ['highCard', 'pair', 'twoPair', 'trips', 'straight', 'flush', 'fullHouse', 'quads', 'straightFlush'];
const RANK_ORDER = '23456789TJQKA';

/** Scores exactly five cards as [category, ...tie-breaks]. Written separately from the engine. */
function reference5(cards: Card[]): number[] {
  const ranks = cards.map((c) => RANK_ORDER.indexOf(c[0] as string) + 2).sort((a, b) => b - a);
  const flush = cards.every((c) => c[1] === (cards[0] as Card)[1]);
  const distinct = new Set(ranks).size === 5;
  let straightTop = 0;
  if (distinct && (ranks[0] as number) - (ranks[4] as number) === 4) straightTop = ranks[0] as number;
  if (distinct && ranks.join() === '14,5,4,3,2') straightTop = 5;
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = groups.map((g) => g[1]).join('');
  const byGroup = groups.map((g) => g[0]);
  if (straightTop && flush) return [8, straightTop];
  if (shape === '41') return [7, ...byGroup];
  if (shape === '32') return [6, ...byGroup];
  if (flush) return [5, ...ranks];
  if (straightTop) return [4, straightTop];
  if (shape === '311') return [3, ...byGroup];
  if (shape === '221') return [2, ...byGroup];
  if (shape === '2111') return [1, ...byGroup];
  return [0, ...ranks];
}

function compareScores(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [first, ...rest] = items as [T, ...T[]];
  return [...combinations(rest, k - 1).map((c) => [first, ...c]), ...combinations(rest, k)];
}

/** Brute force: best of every 5-card combination. */
const referenceBest = (cards: Card[]) =>
  combinations(cards, 5)
    .map(reference5)
    .reduce((best, score) => (compareScores(score, best) > 0 ? score : best));

const sign = (n: number) => Math.sign(n);

const deckOf = (ranks: string) => FULL_DECK.filter((c) => ranks.includes(c[0] as string));
const handFrom = (deck: readonly Card[]) => fc.shuffledSubarray([...deck], { minLength: 5, maxLength: 7 });
// Narrow decks make straights, flushes, quads and full houses common; the low one makes wheels common.
const anyHand = fc.oneof(handFrom(FULL_DECK), handFrom(deckOf('9TJQKA')), handFrom(deckOf('A23456')));

describe('evaluateHand: property tests', () => {
  it('agrees with brute force on category and ordering', () => {
    fc.assert(
      fc.property(anyHand, anyHand, (a, b) => {
        const [va, vb] = [evaluateHand(a), evaluateHand(b)];
        const [ra, rb] = [referenceBest(a), referenceBest(b)];
        expect(va.category).toBe(CATEGORIES[ra[0] as number]);
        expect(sign(va.rankValue - vb.rankValue)).toBe(sign(compareScores(ra, rb)));
      }),
      { numRuns: 3000 },
    );
  });

  it('best5 is five of the given cards and is worth the whole hand', () => {
    fc.assert(
      fc.property(anyHand, (cards) => {
        const value = evaluateHand(cards);
        expect(new Set(value.best5).size).toBe(5);
        expect(value.best5.every((c) => cards.includes(c))).toBe(true);
        expect(evaluateHand(value.best5).rankValue).toBe(value.rankValue);
      }),
      { numRuns: 2000 },
    );
  });
});
