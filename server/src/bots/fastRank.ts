import type { Card } from '@poker/shared';
import { FULL_DECK } from '../engine';

/**
 * A fast hand ranker for bot Monte Carlo runs, on integer card codes instead of strings. It returns
 * exactly the engine's `evaluateHand(cards).rankValue` (tests compare the two on random hands), so
 * bots rank hands by the same rules as the table (game-rules §8); it just skips labels and best-5.
 *
 * Card code = index in FULL_DECK: rank index (0 = deuce … 12 = ace) × 4 + suit index.
 */
export const CARD_CODE: ReadonlyMap<Card, number> = new Map(FULL_DECK.map((card, index) => [card, index]));

// Category indexes, as in the engine's evaluator.
const HIGH_CARD = 0;
const PAIR = 1;
const TWO_PAIR = 2;
const TRIPS = 3;
const STRAIGHT = 4;
const FLUSH = 5;
const FULL_HOUSE = 6;
const QUADS = 7;
const STRAIGHT_FLUSH = 8;

/** Category, then up to five tie-break rank values (2–14), as one number: the engine's encoding. */
function encode(category: number, ...ranks: number[]): number {
  let value = category;
  for (let i = 0; i < 5; i++) value = value * 16 + (ranks[i] ?? 0);
  return value;
}

/** Top rank value (5–14) of the best straight in a 13-bit rank mask (bit 0 = deuce), or 0. The wheel is five-high. */
function straightTop(mask: number): number {
  const withLowAce = (mask << 1) | ((mask >> 12) & 1); // bit k = rank value k + 1
  for (let top = 13; top >= 4; top--) {
    if (((withLowAce >> (top - 4)) & 0x1f) === 0x1f) return top + 1;
  }
  return 0;
}

const counts = new Int8Array(13);
const suitMasks = new Int32Array(4);
const suitCounts = new Int8Array(4);

/** Rank value of the best hand in `codes[0..n)` (5–7 distinct cards). */
export function fastRank(codes: ArrayLike<number>, n: number): number {
  counts.fill(0);
  suitMasks.fill(0);
  suitCounts.fill(0);
  let mask = 0;
  for (let i = 0; i < n; i++) {
    const code = codes[i] as number;
    const rank = code >> 2;
    const suit = code & 3;
    counts[rank] = (counts[rank] as number) + 1;
    suitMasks[suit] = (suitMasks[suit] as number) | (1 << rank);
    suitCounts[suit] = (suitCounts[suit] as number) + 1;
    mask |= 1 << rank;
  }

  let flushMask = 0;
  for (let s = 0; s < 4; s++) if ((suitCounts[s] as number) >= 5) flushMask = suitMasks[s] as number;
  if (flushMask) {
    const top = straightTop(flushMask);
    if (top) return encode(STRAIGHT_FLUSH, top);
  }

  // Groups, highest rank first.
  let quad = -1;
  let trip1 = -1;
  let trip2 = -1;
  let pair1 = -1;
  let pair2 = -1;
  for (let r = 12; r >= 0; r--) {
    const c = counts[r] as number;
    if (c === 4) quad = r;
    else if (c === 3) {
      if (trip1 < 0) trip1 = r;
      else if (trip2 < 0) trip2 = r;
    } else if (c === 2) {
      if (pair1 < 0) pair1 = r;
      else if (pair2 < 0) pair2 = r;
    }
  }
  /** The highest `k` rank values present, skipping the excluded ranks. */
  const kickers = (k: number, x1 = -1, x2 = -1): number[] => {
    const out: number[] = [];
    for (let r = 12; r >= 0 && out.length < k; r--) if ((mask >> r) & 1 && r !== x1 && r !== x2) out.push(r + 2);
    return out;
  };

  if (quad >= 0) return encode(QUADS, quad + 2, ...kickers(1, quad));
  if (trip1 >= 0 && (trip2 >= 0 || pair1 >= 0)) return encode(FULL_HOUSE, trip1 + 2, Math.max(trip2, pair1) + 2);
  if (flushMask) {
    const top: number[] = [];
    for (let r = 12; r >= 0 && top.length < 5; r--) if ((flushMask >> r) & 1) top.push(r + 2);
    return encode(FLUSH, ...top);
  }
  const straight = straightTop(mask);
  if (straight) return encode(STRAIGHT, straight);
  if (trip1 >= 0) return encode(TRIPS, trip1 + 2, ...kickers(2, trip1));
  if (pair2 >= 0) return encode(TWO_PAIR, pair1 + 2, pair2 + 2, ...kickers(1, pair1, pair2));
  if (pair1 >= 0) return encode(PAIR, pair1 + 2, ...kickers(3, pair1));
  return encode(HIGH_CARD, ...kickers(5));
}
