import type { Card, PublicAction } from '@poker/shared';
import { FULL_DECK } from '../engine';
import { CARD_CODE, fastRank } from './fastRank';
import { preflopScore } from './handStrength';
import type { Tendencies } from './reads';
import type { Rng } from './rng';

/**
 * Hand ranges for the Pro bot. A person who raised before the flop and then bet twice rarely holds
 * seven-deuce; a person who checked and called usually holds something middling. Pro turns each
 * opponent's public betting line (and how that player tends to play) into a weight for every
 * two-card hand they could hold, then deals its Monte Carlo run-outs from those weights.
 * Everything here works from public information and the bot's own cards only.
 */

/** Relative likelihood (0–1) that an opponent holds the two cards with these codes. */
export type HandWeight = (a: number, b: number) => number;

/** Chen scores for every pair of card codes, computed once. */
const CHEN = new Float32Array(52 * 52);
for (let a = 0; a < 52; a++) {
  for (let b = 0; b < 52; b++) {
    if (a !== b) CHEN[a * 52 + b] = preflopScore([FULL_DECK[a] as Card, FULL_DECK[b] as Card]);
  }
}

const CATEGORY_SHIFT = 2 ** 20; // fastRank: category × 16^5 + tie-breaks
const categoryOf = (value: number) => Math.floor(value / CATEGORY_SHIFT);

/** How an opponent's cards fit a board (an index into the move factors below). */
const Fit = {
  Strong: 0, // two pair or better, made with their own cards
  TopPair: 1, // top pair or an overpair
  WeakPair: 2,
  Draw: 3, // four to a flush or a straight
  Air: 4,
} as const;
type Fit = (typeof Fit)[keyof typeof Fit];

type StreetMove = 'raise' | 'call' | 'check';

/** An opponent's line: their role before the flop and their most telling move on each later street. */
export interface Line {
  preflop: 'reraiser' | 'raiser' | 'caller' | 'limper';
  /** Flop, turn, river, as far as the hand has gone. */
  streets: StreetMove[];
}

/** Reads a seat's line from the hand's public history. */
export function lineOf(seat: number, history: readonly PublicAction[]): Line {
  let raisesSoFar = 0;
  let preflop: Line['preflop'] = 'limper';
  for (const action of history) {
    if (action.street !== 'preflop') continue;
    const raise = action.type === 'raise' || action.type === 'bet';
    if (action.seat === seat) {
      if (raise) preflop = raisesSoFar > 0 ? 'reraiser' : 'raiser';
      else if (action.type === 'call' && raisesSoFar > 0 && preflop === 'limper') preflop = 'caller';
    }
    if (raise) raisesSoFar++;
  }
  const streets: StreetMove[] = [];
  for (const street of ['flop', 'turn', 'river'] as const) {
    const moves = history.filter((a) => a.street === street && a.seat === seat);
    if (moves.length === 0) continue;
    streets.push(
      moves.some((a) => a.type === 'raise' || a.type === 'bet') ? 'raise' : moves.some((a) => a.type === 'call') ? 'call' : 'check',
    );
  }
  return { preflop, streets };
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** The weight function for one opponent, from their line, their tendencies and the board. */
export function rangeWeight(line: Line, style: Tendencies, board: readonly Card[]): HandWeight {
  // Before the flop: a tight raiser's range is the top of the deck; a limper's is nearly anything.
  const pre = {
    reraiser: { center: clamp(11 - 10 * (style.pfr - 0.15), 7, 12.5), floor: 0.01 },
    raiser: { center: clamp(9 - 12 * (style.pfr - 0.15), 4.5, 11), floor: 0.02 },
    caller: { center: clamp(6.5 - 8 * (style.vpip - 0.3), 2, 8), floor: 0.05 },
    limper: { center: clamp(3 - 5 * (style.vpip - 0.3), -1, 4), floor: 0.25 },
  }[line.preflop];

  // After the flop: how likely each kind of holding is to have made each move. The more often a
  // player bets, the less a bet says: a maniac's bets are spread over nearly every hand.
  const loose = clamp((style.aggression - 0.35) / 0.55, 0, 0.85);
  const toward = (f: number) => f + (1 - f) * loose;
  const floats = clamp(0.1 + 0.8 * (style.vpip - 0.3), 0.06, 0.55);
  const factor: Record<StreetMove, readonly number[]> = {
    //       Strong TopPair WeakPair Draw   Air
    raise: [1, toward(0.8), toward(0.35), toward(0.55), toward(0.12)],
    call: [0.7, 1, 0.7, 0.85, floats],
    check: [0.45, 0.8, 1, 1, 1],
  };

  const boards = line.streets.map((_, i) => board.slice(0, 3 + i).map((card) => CARD_CODE.get(card) as number));
  const boardInfo = boards.map((codes) => ({
    codes,
    category: codes.length === 5 ? categoryOf(fastRank(codes, 5)) : groupCategory(codes),
    top: Math.max(...codes.map((c) => c >> 2)) + 2,
  }));
  const hand = new Array<number>(7);

  return (a, b) => {
    let weight = pre.floor + (1 - pre.floor) * sigmoid(((CHEN[a * 52 + b] as number) - pre.center) / 1.2);
    for (let i = 0; i < boardInfo.length; i++) {
      const info = boardInfo[i]!;
      hand[0] = a;
      hand[1] = b;
      for (let j = 0; j < info.codes.length; j++) hand[2 + j] = info.codes[j] as number;
      weight *= factor[line.streets[i]!][fit(hand, 2 + info.codes.length, info.category, info.top)] as number;
    }
    return weight;
  };
}

/** Pair-type category of 3–4 board cards (no straight or flush is possible yet). */
function groupCategory(codes: readonly number[]): number {
  const counts = new Map<number, number>();
  for (const c of codes) counts.set(c >> 2, (counts.get(c >> 2) ?? 0) + 1);
  const sizes = [...counts.values()].sort((x, y) => y - x);
  if (sizes[0] === 4) return 7;
  if (sizes[0] === 3) return 3;
  if (sizes[0] === 2) return sizes[1] === 2 ? 2 : 1;
  return 0;
}

function fit(hand: number[], n: number, boardCategory: number, boardTop: number): Fit {
  const value = fastRank(hand, n);
  const category = categoryOf(value);
  if (category > boardCategory) {
    if (category >= 2) return Fit.Strong;
    const pairRank = Math.floor(value / 65536) % 16;
    return pairRank >= boardTop ? Fit.TopPair : Fit.WeakPair;
  }
  return n < 7 && hasDraw(hand, n) ? Fit.Draw : Fit.Air;
}

/** Four to a flush, or four of five straight ranks, using at least one of the first two (hole) cards. */
function hasDraw(hand: readonly number[], n: number): boolean {
  const suits = [0, 0, 0, 0];
  let mask = 0;
  let boardMask = 0;
  for (let i = 0; i < n; i++) {
    const c = hand[i] as number;
    suits[c & 3]! += 1;
    mask |= 1 << ((c >> 2) + 1);
    if (i >= 2) boardMask |= 1 << ((c >> 2) + 1);
  }
  const holeSuits = [(hand[0] as number) & 3, (hand[1] as number) & 3];
  if (holeSuits.some((s) => suits[s] === 4)) return true;
  // Rank bits 1..14 (ace also at bit 1 for the wheel).
  if (mask & (1 << 14)) mask |= 2;
  if (boardMask & (1 << 14)) boardMask |= 2;
  for (let low = 1; low <= 10; low++) {
    const window = 0x1f << low;
    if (bits(mask & window) >= 4 && bits(boardMask & window) < 4) return true;
  }
  return false;
}

function bits(x: number): number {
  let count = 0;
  for (let v = x; v; v &= v - 1) count++;
  return count;
}

/**
 * Share of the pot the bot's hand wins against opponents holding hands drawn from their ranges.
 * Each opponent's cards are drawn in proportion to their weight; then the board is completed at
 * random. Ties count as a split.
 */
export function rangeEquity(
  hole: readonly [Card, Card],
  board: readonly Card[],
  ranges: readonly HandWeight[],
  trials: number,
  rng: Rng,
): number {
  const code = (card: Card) => CARD_CODE.get(card) as number;
  const seen = new Set<Card>([...hole, ...board]);
  const deck = FULL_DECK.filter((card) => !seen.has(card)).map(code);
  const toCome = 5 - board.length;
  if (ranges.length === 0) return 1;
  if (toCome + 2 * ranges.length > deck.length) return 1;

  const mine = [code(hole[0]), code(hole[1]), ...board.map(code), 0, 0, 0, 0, 0].slice(0, 7);
  const theirs = [0, 0, ...board.map(code), 0, 0, 0, 0, 0].slice(0, 7);
  const held = ranges.map(() => [0, 0]);
  const used = new Int32Array(deck.length); // stamped with the trial number, so it never needs clearing
  const pick = (stamp: number): number => {
    for (;;) {
      const i = Math.floor(rng() * deck.length);
      if (used[i] !== stamp) return i;
    }
  };

  // Each opponent's range as a cumulative distribution over every two-card hand still possible,
  // weighed once per decision; trials then sample it directly.
  const pairs: [number, number][] = [];
  for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) pairs.push([i, j]);
  const cumulative = ranges.map((weight) => {
    const cdf = new Float64Array(pairs.length);
    let total = 0;
    pairs.forEach(([i, j], k) => {
      total += weight(deck[i] as number, deck[j] as number);
      cdf[k] = total;
    });
    // A range that rules out every hand (it can't happen in play) falls back to all hands alike.
    if (total <= 0) cdf.forEach((_, k) => (cdf[k] = k + 1));
    return cdf;
  });
  const sample = (cdf: Float64Array): number => {
    const target = rng() * (cdf[cdf.length - 1] as number);
    let lo = 0;
    let hi = cdf.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((cdf[mid] as number) > target) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  };

  let won = 0;
  for (let trial = 1; trial <= trials; trial++) {
    for (let o = 0; o < ranges.length; o++) {
      // Redraw on a clash with a hand already dealt to another opponent this trial.
      for (let attempt = 0; ; attempt++) {
        const [i, j] = pairs[sample(cumulative[o]!)]!;
        if ((used[i] === trial || used[j] === trial) && attempt < 50) continue;
        used[i] = trial;
        used[j] = trial;
        held[o]![0] = deck[i] as number;
        held[o]![1] = deck[j] as number;
        break;
      }
    }
    for (let k = 0; k < toCome; k++) {
      const i = pick(trial);
      used[i] = trial;
      mine[2 + board.length + k] = deck[i] as number;
      theirs[2 + board.length + k] = deck[i] as number;
    }
    const value = fastRank(mine, 7);
    let sharing = 1;
    let beaten = false;
    for (let o = 0; o < ranges.length && !beaten; o++) {
      theirs[0] = held[o]![0] as number;
      theirs[1] = held[o]![1] as number;
      const other = fastRank(theirs, 7);
      if (other > value) beaten = true;
      else if (other === value) sharing += 1;
    }
    if (!beaten) won += 1 / sharing;
  }
  return won / trials;
}
