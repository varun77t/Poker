import type { Card, HandCategory } from '@poker/shared';
import { isCard } from './deck';
import type { HandValue } from './types';

/**
 * Hand ranking (game-rules §8). Evaluates the best 5-card hand from 5–7 cards directly (no 21-combo
 * loop), since bots will call this in Monte Carlo loops. Tests check it against brute force.
 */

const CATEGORY_ORDER: readonly HandCategory[] = [
  'highCard',
  'pair',
  'twoPair',
  'trips',
  'straight',
  'flush',
  'fullHouse',
  'quads',
  'straightFlush',
];

const RANK_VALUE: Readonly<Record<string, number>> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, T: 10, J: 11, Q: 12, K: 13, A: 14,
};
const NAMES = ['', '', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
const PLURALS = ['', '', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];

const rankOf = (card: Card): number => RANK_VALUE[card[0] as string] as number;
const name = (rank: number) => NAMES[rank] as string;
const plural = (rank: number) => PLURALS[rank] as string;

/** Rank-descending order; ties keep input order so results are deterministic. */
const byRankDesc = (cards: readonly Card[]) => [...cards].sort((a, b) => rankOf(b) - rankOf(a));

/** Category first, then up to five tie-break ranks, as one comparable number. */
function encode(category: HandCategory, ranks: readonly number[]): number {
  let value = CATEGORY_ORDER.indexOf(category);
  for (let i = 0; i < 5; i++) value = value * 16 + (ranks[i] ?? 0);
  return value;
}

function hand(category: HandCategory, tieBreak: readonly number[], best5: Card[], label: string): HandValue {
  return { category, rankValue: encode(category, tieBreak), best5, label };
}

/**
 * The highest five-card straight among `cards` (one card per rank), top card first. The wheel is
 * returned as 5-4-3-2-A, so it counts as five-high (R-8.2). No wrap-around.
 */
function findStraight(cards: readonly Card[]): Card[] | null {
  const oneOfEachRank = new Map<number, Card>();
  for (const card of byRankDesc(cards)) if (!oneOfEachRank.has(rankOf(card))) oneOfEachRank.set(rankOf(card), card);
  for (let top = 14; top >= 5; top--) {
    const run: Card[] = [];
    for (let rank = top; rank > top - 5; rank--) {
      const card = oneOfEachRank.get(rank === 1 ? 14 : rank);
      if (!card) break;
      run.push(card);
    }
    if (run.length === 5) return run;
  }
  return null;
}

/** Best hand from 5–7 distinct cards (R-8.4): only the best five count (R-8.5), suits never break ties (R-8.3). */
export function evaluateHand(cards: readonly Card[]): HandValue {
  if (cards.length < 5 || cards.length > 7) throw new Error(`evaluateHand needs 5–7 cards, got ${cards.length}`);
  if (!cards.every(isCard) || new Set(cards).size !== cards.length) {
    throw new Error(`evaluateHand got invalid or duplicate cards: ${cards.join(' ')}`);
  }

  const sorted = byRankDesc(cards);
  const bySuit = new Map<string, Card[]>();
  const byRank = new Map<number, Card[]>();
  for (const card of sorted) {
    bySuit.set(card[1] as string, [...(bySuit.get(card[1] as string) ?? []), card]);
    byRank.set(rankOf(card), [...(byRank.get(rankOf(card)) ?? []), card]);
  }
  const flushCards = [...bySuit.values()].find((suited) => suited.length >= 5) ?? null;
  // Rank groups, biggest group first, then highest rank.
  const groups = [...byRank.entries()]
    .map(([rank, group]) => ({ rank, cards: group }))
    .sort((a, b) => b.cards.length - a.cards.length || b.rank - a.rank);
  const kickers = (exclude: readonly number[], count: number) =>
    sorted.filter((card) => !exclude.includes(rankOf(card))).slice(0, count);

  if (flushCards) {
    const straightFlush = findStraight(flushCards);
    if (straightFlush) {
      const top = rankOf(straightFlush[0] as Card);
      const label = top === 14 ? 'Royal Flush' : `Straight Flush, ${name(top)} high`;
      return hand('straightFlush', [top], straightFlush, label);
    }
  }

  const [first, second] = groups as [(typeof groups)[number], (typeof groups)[number] | undefined];
  if (first.cards.length === 4) {
    const kicker = kickers([first.rank], 1);
    return hand('quads', [first.rank, ...kicker.map(rankOf)], [...first.cards, ...kicker], `Four of a Kind, ${plural(first.rank)}`);
  }

  if (first.cards.length === 3 && second && second.cards.length >= 2) {
    // With two sets of trips, the second one plays as the pair (groups are sorted by rank within size).
    return hand(
      'fullHouse',
      [first.rank, second.rank],
      [...first.cards, ...second.cards.slice(0, 2)],
      `Full House, ${plural(first.rank)} over ${plural(second.rank)}`,
    );
  }

  if (flushCards) {
    const best5 = flushCards.slice(0, 5);
    return hand('flush', best5.map(rankOf), best5, `Flush, ${name(rankOf(best5[0] as Card))} high`);
  }

  const straight = findStraight(sorted);
  if (straight) {
    const top = rankOf(straight[0] as Card);
    return hand('straight', [top], straight, `Straight, ${name(top)} high`);
  }

  if (first.cards.length === 3) {
    const kick = kickers([first.rank], 2);
    return hand('trips', [first.rank, ...kick.map(rankOf)], [...first.cards, ...kick], `Three of a Kind, ${plural(first.rank)}`);
  }

  if (first.cards.length === 2 && second && second.cards.length === 2) {
    const kick = kickers([first.rank, second.rank], 1);
    return hand(
      'twoPair',
      [first.rank, second.rank, ...kick.map(rankOf)],
      [...first.cards, ...second.cards, ...kick],
      `Two Pair, ${plural(first.rank)} and ${plural(second.rank)}`,
    );
  }

  if (first.cards.length === 2) {
    const kick = kickers([first.rank], 3);
    return hand('pair', [first.rank, ...kick.map(rankOf)], [...first.cards, ...kick], `Pair of ${plural(first.rank)}`);
  }

  const best5 = sorted.slice(0, 5);
  return hand('highCard', best5.map(rankOf), best5, `High Card, ${name(rankOf(best5[0] as Card))}`);
}
