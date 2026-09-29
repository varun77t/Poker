import type { Card, GamePlayerView } from '@poker/shared';
import { handHint } from '../engine';
import { preflopScore } from './handStrength';
import { lineOf, rangeEquity, rangeWeight } from './ranges';
import { tendencies, type Reads, type Tendencies } from './reads';
import type { Rng } from './rng';
import { CALL, CHECK, FOLD, playersBehind, potSized, raiseTo, type Spot, type Wish } from './spot';

/**
 * The Pro bot (product-spec §3.7). What separates it from Medium:
 * - It reads ranges, not random hands: each opponent's public betting line this hand (raised,
 *   called, bet, checked) and how that player has played so far narrow what they can hold, and Pro's
 *   equity is measured against that (ranges.ts). A bet from a player who only bets strong hands
 *   makes it fold one pair; the same bet from a frequent bluffer gets called.
 * - It plays positions and prices before the flop: tighter early, steals late, re-raises its best
 *   hands (and a few suited bluffs), and plays push-or-fold when short.
 * - It bets for value at sizes chosen for the board and the opponent (bigger against players who call
 *   too much), semi-bluffs its draws, continuation-bets as the pre-flop raiser, and bluffs rivers
 *   when an opponent has shown weakness, but hardly ever against someone who never folds.
 * - It mixes: every choice has some randomness, so it has no fixed pattern to exploit.
 */

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

const rankValue = (card: Card) => '23456789TJQKA'.indexOf(card[0] as string) + 2;

function opponentsOf(spot: Spot): GamePlayerView[] {
  return spot.view.players.filter((p) => p !== spot.me && p.status !== 'folded');
}

const styleOf = (reads: Reads, player: GamePlayerView): Tendencies => tendencies(reads.get(player.playerId));

// ------------------------------------------------------------ pre-flop

export function proPreflop(spot: Spot, rng: Rng, reads: Reads): Wish {
  const { view, bigBlind, legal, hole } = spot;
  const score = preflopScore(hole) + (rng() - 0.5);
  const behind = playersBehind(spot);
  const headsUp = view.players.length === 2;
  const blinds = spot.depth / bigBlind;
  const preflop = view.history.filter((a) => a.street === 'preflop');
  const raises = preflop.filter((a) => a.type === 'raise' || a.type === 'bet');
  const suited = hole[0][1] === hole[1][1];
  const gap = Math.abs(rankValue(hole[0]) - rankValue(hole[1]));
  const bluffable = suited && (gap <= 2 || Math.max(rankValue(hole[0]), rankValue(hole[1])) === 14);

  if (raises.length === 0) {
    const limps = preflop.filter((a) => a.type === 'call');
    // Limpers who play almost every hand are weak: isolate them with a wider range than tight limpers.
    const limperLooseness = limps.map((a) => {
      const player = view.players.find((p) => p.seat === a.seat);
      return player ? styleOf(reads, player).vpip : 0.3;
    });
    const limpers = limperLooseness.reduce((sum, vpip) => sum + clamp(1 - (vpip - 0.3) * 2, 0.3, 1), 0);
    if (legal.canCheck) {
      // The big blind's option: punish limpers with strong hands, now and then with a suited bluff.
      if (score >= 8 + limpers * 0.5 || (limps.length <= 1 && bluffable && rng() < 0.15)) {
        return raiseTo(spot, bigBlind * (3.5 + limps.length));
      }
      return CHECK;
    }
    // Blinds that seldom defend are worth stealing from: open wider when the players left behind are tight.
    const blindsLeft = view.players.filter((p) => p !== spot.me && (p.seat === view.sbSeat || p.seat === view.bbSeat));
    const defend = blindsLeft.length ? Math.max(...blindsLeft.map((p) => styleOf(reads, p).vpip)) : 0.3;
    const steal = limps.length === 0 && behind <= 2 ? clamp((0.5 - defend) * 8, 0, 2) : 0;
    const openAt = (headsUp ? 3 : 4 + 1.1 * behind) - steal;
    if (blinds <= 15) return score >= openAt - 0.5 + limpers * 0.5 ? raiseTo(spot, spot.depth) : FOLD; // push or fold
    if (score >= openAt + limpers) return raiseTo(spot, bigBlind * (2.3 + rng() * 0.3 + limps.length * 1.2));
    if (limps.length === 0 && behind <= 2 && score >= openAt - 2 && rng() < 0.35) return raiseTo(spot, bigBlind * 2.5); // steal
    if (spot.toCall <= bigBlind / 2 && score >= openAt - 2) return CALL; // the small blind completes
    return FOLD;
  }

  // Facing a raise: how loose is the last raiser? A wide raiser gets re-raised and called wider.
  const raiser = view.players.find((p) => p.seat === raises[raises.length - 1]?.seat);
  const loose = raiser ? clamp((styleOf(reads, raiser).pfr - 0.15) * 10, -1, 2) : 0;
  const price = spot.toCall / spot.depth;
  const potOdds = spot.toCall / (spot.pot + spot.toCall);

  if (raises.length === 1) {
    const valueAt = 10.5 - loose * 0.75;
    if (blinds <= 20) return score >= valueAt - 1.5 ? raiseTo(spot, spot.depth) : legal.canCheck ? CHECK : FOLD;
    if (score >= valueAt) return rng() < 0.85 ? raiseTo(spot, spot.level * (behind === 0 ? 3.5 : 3)) : CALL;
    const callers = preflop.filter((a) => a.type === 'call' && preflop.indexOf(a) > preflop.indexOf(raises[0]!)).length;
    if (callers === 0 && bluffable && score >= 4 && rng() < 0.12) return raiseTo(spot, spot.level * 3); // light 3-bet
    const inBigBlind = spot.me.seat === view.bbSeat;
    const callAt = 7.5 - loose * 0.5 + (price > 0.15 ? 1.5 : price > 0.08 ? 0.5 : 0) - (inBigBlind ? 1 : 0) - (potOdds < 0.25 ? 0.5 : 0);
    return score >= callAt ? CALL : FOLD;
  }
  if (raises.length === 2) {
    if (score >= 14 || (score >= 12 && rng() < 0.5)) return raiseTo(spot, blinds <= 45 ? spot.depth : spot.level * 2.4);
    if (score >= 10 - loose * 0.5 && price <= 0.3) return CALL;
    if (score >= 9 && price <= 0.12) return CALL;
    return FOLD;
  }
  if (score >= 16 || (score >= 14 && rng() < 0.6)) return raiseTo(spot, spot.depth);
  if (score >= 12 && price <= 0.2) return CALL;
  return FOLD;
}

// ----------------------------------------------------------- post-flop

export function proPostflop(spot: Spot, rng: Rng, reads: Reads, trials: number): Wish {
  const { view, legal, hole } = spot;
  const board = view.board;
  const opponents = opponentsOf(spot);
  const styles = opponents.map((p) => styleOf(reads, p));
  const ranges = opponents.map((p, i) => rangeWeight(lineOf(p.seat, view.history), styles[i]!, board));
  const equity = rangeEquity(hole, board, ranges, trials, rng);

  const headsUp = opponents.length === 1;
  const river = view.street === 'river';
  const hint = handHint(hole, board);
  const drawing = !river && hint.draws.length > 0;
  // The least willing folder decides whether a bluff can work; a player who calls everything gets value instead.
  const foldiness = Math.min(...styles.map((s) => s.foldToBet));
  const station = foldiness < 0.3;
  const wet = isWet(board);
  const raisedPreflop = ['raiser', 'reraiser'].includes(lineOf(spot.me.seat, view.history).preflop);

  if (spot.toCall === 0) {
    // The more an opponent calls, the thinner Pro bets for value (and the less it bluffs, below).
    const sticky = clamp((0.45 - foldiness) * 0.4, 0, 0.1);
    const valueAt = ([0.62, 0.52, 0.45, 0.4][opponents.length - 1] ?? 0.4) - sticky;
    if (equity >= 0.85 && headsUp && !wet && !river && rng() < 0.25) return CHECK; // trap on a dry board
    if (equity >= valueAt) {
      const size = station
        ? river && equity >= 0.8
          ? 0.9 + rng() * 0.35 // they call anyway: overbet the best hands
          : 0.75 + rng() * 0.25
        : river && equity >= 0.8
          ? 0.7 + rng() * 0.3
          : wet
            ? 0.6 + rng() * 0.15
            : 0.4 + rng() * 0.25;
      return potSized(spot, size);
    }
    if (drawing && equity >= 0.25 && rng() < (headsUp ? 0.55 : 0.25) * (station ? 0.5 : 1)) {
      return potSized(spot, 0.55 + rng() * 0.15); // semi-bluff
    }
    if (view.street === 'flop' && raisedPreflop && headsUp && rng() < clamp(foldiness * 1.3, 0.15, 0.7)) {
      return potSized(spot, 0.4 + rng() * 0.2); // continuation bet, more often against players who fold
    }
    if (river && headsUp && equity < 0.25) {
      const checkedToMe = view.history.some((a) => a.street === 'river' && a.seat !== spot.me.seat && a.type === 'check');
      if (rng() < foldiness * (checkedToMe ? 0.7 : 0.4)) return potSized(spot, 0.7 + rng() * 0.3); // bluff
    }
    if (equity >= valueAt - 0.12 && (station || !river) && rng() < 0.35) return potSized(spot, 0.4); // thin value
    return CHECK;
  }

  // Facing a bet: the price against the range that bet.
  const potOdds = spot.toCall / (spot.pot + spot.toCall);
  let needed = potOdds + 0.02;
  if (drawing && spot.me.stack > spot.pot) needed -= 0.05; // implied odds: more to win when the draw hits
  if (spot.toCall > spot.me.stack * 0.5) needed += 0.04; // the stack is at risk
  const raiseAt = headsUp ? Math.max(0.72, needed + 0.22) : Math.max(0.78, needed + 0.25);
  if (equity >= raiseAt) {
    if (legal.canRaise && rng() < (river ? 0.85 : 0.7)) return potSized(spot, 0.75 + rng() * 0.35);
    return CALL; // let them keep betting
  }
  if (drawing && headsUp && !station && legal.canRaise && equity >= needed - 0.08 && rng() < 0.18) {
    return potSized(spot, 0.8); // semi-bluff raise
  }
  if (equity >= needed) return CALL;
  // A rare river bluff-raise, only against a player who bets so often that many of their bets are bluffs.
  if (river && headsUp && legal.canRaise && equity < 0.15 && styles[0]!.aggression > 0.55 && rng() < 0.05) {
    return potSized(spot, 1);
  }
  return FOLD;
}

/** A board with a flush draw or straight draws out there: bet bigger to charge them. */
function isWet(board: readonly Card[]): boolean {
  const suits = new Map<string, number>();
  for (const card of board) suits.set(card[1] as string, (suits.get(card[1] as string) ?? 0) + 1);
  if ([...suits.values()].some((n) => n >= 2) && board.length < 5) return true;
  const ranks = [...new Set(board.map(rankValue))].sort((a, b) => a - b);
  for (let i = 0; i + 2 < ranks.length; i++) if ((ranks[i + 2] as number) - (ranks[i] as number) <= 4) return true;
  return false;
}
