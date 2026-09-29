import { RANKS, type Card } from '@poker/shared';
import { FULL_DECK } from '../engine';
import { CARD_CODE, fastRank } from './fastRank';
import type { Rng } from './rng';

const rankOf = (card: Card): number => RANKS.indexOf(card[0] as (typeof RANKS)[number]) + 2;

/** Chen's points for a single card: ace 10, king 8, queen 7, jack 6, otherwise half the face value. */
function chenPoints(rank: number): number {
  if (rank === 14) return 10;
  if (rank === 13) return 8;
  if (rank === 12) return 7;
  if (rank === 11) return 6;
  return rank / 2;
}

/**
 * Bill Chen's formula: a quick preflop score from about -1 (seven-deuce offsuit) to 20 (aces).
 * Pairs double (at least 5), suited +2, gaps cost 1/2/4/5, small connectors +1; halves round up.
 */
export function preflopScore([a, b]: readonly [Card, Card]): number {
  const high = Math.max(rankOf(a), rankOf(b));
  const low = Math.min(rankOf(a), rankOf(b));
  if (high === low) return Math.max(5, chenPoints(high) * 2);

  let score = chenPoints(high);
  if (a[1] === b[1]) score += 2;
  const gap = high - low - 1;
  score -= [0, 1, 2, 4][gap] ?? 5;
  if (gap <= 1 && high < 12) score += 1;
  return Math.ceil(score);
}

/**
 * Share of the pot the bot's hand wins against `opponents` unknown hands, from `trials` random
 * run-outs. Only cards the bot can see are excluded from the draw: its own hole cards, the board and
 * any revealed hand in `known`. Ties count as a split.
 */
export function estimateEquity(
  hole: readonly [Card, Card],
  board: readonly Card[],
  opponents: number,
  trials: number,
  rng: Rng,
  known: readonly Card[] = [],
): number {
  const code = (card: Card) => CARD_CODE.get(card) as number;
  const seen = new Set<Card>([...hole, ...board, ...known]);
  const deck = FULL_DECK.filter((card) => !seen.has(card)).map(code);
  const toCome = 5 - board.length;
  const draw = toCome + 2 * opponents;
  if (opponents < 1 || draw > deck.length) return 1;

  // Reused buffers: slots 0–1 hold hole cards, the rest the board (completed on each trial).
  const mine = [code(hole[0]), code(hole[1]), ...board.map(code), 0, 0, 0, 0, 0].slice(0, 7);
  const theirs = [0, 0, ...board.map(code), 0, 0, 0, 0, 0].slice(0, 7);
  let won = 0;
  for (let trial = 0; trial < trials; trial++) {
    // Partial Fisher–Yates: the first `draw` cards of the deck become this run-out.
    for (let i = 0; i < draw; i++) {
      const j = i + Math.floor(rng() * (deck.length - i));
      const card = deck[j] as number;
      deck[j] = deck[i] as number;
      deck[i] = card;
    }
    for (let i = 0; i < toCome; i++) {
      const card = deck[i] as number;
      mine[2 + board.length + i] = card;
      theirs[2 + board.length + i] = card;
    }
    const value = fastRank(mine, 7);
    let sharing = 1;
    let beaten = false;
    for (let o = 0; o < opponents && !beaten; o++) {
      theirs[0] = deck[toCome + 2 * o] as number;
      theirs[1] = deck[toCome + 2 * o + 1] as number;
      const other = fastRank(theirs, 7);
      if (other > value) beaten = true;
      else if (other === value) sharing += 1;
    }
    if (!beaten) won += 1 / sharing;
  }
  return won / trials;
}
