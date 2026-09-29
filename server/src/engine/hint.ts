import type { Card, HandCategory, HandDraw, HandHint } from '@poker/shared';
import { evaluateHand, name, plural, rankOf } from './evaluator';

/**
 * The viewer's hand hint (GameView.yourHand): what their two cards and the board make right now,
 * and what they could draw to. Uses only cards the viewer can already see, so it reveals nothing.
 */
export function handHint(hole: readonly [Card, Card], board: readonly Card[]): HandHint {
  if (board.length === 0) {
    const [a, b] = [rankOf(hole[0]), rankOf(hole[1])];
    return a === b
      ? { category: 'pair', label: `Pair of ${plural(a)}`, onBoard: false, draws: [] }
      : { category: 'highCard', label: `${name(Math.max(a, b))} high`, onBoard: false, draws: [] };
  }

  const cards = [...hole, ...board];
  const best = evaluateHand(cards);
  const label = best.category === 'highCard' ? `${name(rankOf(best.best5[0] as Card))} high` : best.label;
  const onBoard =
    best.category !== 'highCard' &&
    (board.length === 5 ? evaluateHand(board).rankValue === best.rankValue : groupCategory(board) === best.category);
  const draws: HandDraw[] = [];
  if (board.length < 5) {
    const order = CATEGORIES.indexOf(best.category);
    if (order < CATEGORIES.indexOf('flush') && hasFlushDraw(hole, cards)) draws.push('flushDraw');
    if (order < CATEGORIES.indexOf('straight')) {
      const ways = straightWays(hole, board);
      if (ways >= 2) draws.push('straightDraw');
      else if (ways === 1) draws.push('gutshot');
    }
  }
  return { category: best.category, label, onBoard, draws };
}

const CATEGORIES: readonly HandCategory[] = [
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

/** The pair-type category of 3–4 board cards on their own (no straights or flushes are possible yet). */
function groupCategory(board: readonly Card[]): HandCategory {
  const counts = new Map<number, number>();
  for (const card of board) counts.set(rankOf(card), (counts.get(rankOf(card)) ?? 0) + 1);
  const sizes = [...counts.values()].sort((a, b) => b - a);
  if (sizes[0] === 4) return 'quads';
  if (sizes[0] === 3) return 'trips';
  if (sizes[0] === 2) return sizes[1] === 2 ? 'twoPair' : 'pair';
  return 'highCard';
}

/** Four cards of one suit, at least one of them the viewer's own. */
function hasFlushDraw(hole: readonly Card[], cards: readonly Card[]): boolean {
  return hole.some((own) => cards.filter((card) => card[1] === own[1]).length === 4);
}

/** Rank values present, with the ace also counted as 1 for the wheel. */
function rankSet(cards: readonly Card[]): Set<number> {
  const ranks = new Set(cards.map(rankOf));
  if (ranks.has(14)) ranks.add(1);
  return ranks;
}

function hasStraight(ranks: ReadonlySet<number>): boolean {
  for (let low = 1; low <= 10; low++) {
    let run = 0;
    while (run < 5 && ranks.has(low + run)) run++;
    if (run === 5) return true;
  }
  return false;
}

/**
 * How many missing ranks would give the viewer a straight that the board alone wouldn't: 2 for an
 * open-ended draw (or a double gutshot), 1 for a gutshot, 0 for none.
 */
function straightWays(hole: readonly Card[], board: readonly Card[]): number {
  const mine = rankSet([...hole, ...board]);
  const boardOnly = rankSet(board);
  let ways = 0;
  for (let rank = 2; rank <= 14; rank++) {
    if (mine.has(rank)) continue;
    const add = (set: ReadonlySet<number>) => new Set([...set, rank, ...(rank === 14 ? [1] : [])]);
    if (hasStraight(add(mine)) && !hasStraight(add(boardOnly))) ways++;
  }
  return ways;
}
