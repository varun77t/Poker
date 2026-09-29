import type { ActionIntent, BotLevel, LegalActions } from '@poker/shared';
import { estimateEquity, preflopScore } from './handStrength';
import { proPostflop, proPreflop } from './pro';
import type { Rng } from './rng';
import {
  CALL,
  CHECK,
  either,
  FOLD,
  playersBehind,
  potSized,
  raiseTo,
  readSpot,
  strongAt,
  type BotInput,
  type Spot,
  type Wish,
} from './spot';

export type { BotInput } from './spot';

/**
 * How bots choose an action (docs/product-spec.md §3.7). Pure, like the engine: no timers, no I/O,
 * no Math.random; the RNG is injected.
 *
 * A bot's only inputs are what a player in its seat would see: its own `toGameView` projection, its
 * legal actions and the room's public big blind. It never sees other players' hole cards or the
 * deck, so its Monte Carlo runs deal the unseen cards at random, like a person guessing.
 */

/** Monte Carlo run-outs per post-flop decision. Every level stays well under 50 ms a decision. */
export const EQUITY_TRIALS: Record<BotLevel, number> = { easy: 150, medium: 600, pro: 500 };

/** A bot's action. Always legal for `input.legal`: every wish passes through `toLegal`. */
export function decide(input: BotInput, rng: Rng): ActionIntent {
  const spot = readSpot(input);
  const reads = input.reads ?? new Map();
  let wish: Wish;
  if (input.level === 'easy') wish = spot.preflop ? easyPreflop(spot, rng) : easyPostflop(spot, rng);
  else if (input.level === 'medium') wish = spot.preflop ? mediumPreflop(spot, rng) : mediumPostflop(spot, rng);
  else wish = spot.preflop ? proPreflop(spot, rng, reads) : proPostflop(spot, rng, reads, EQUITY_TRIALS.pro);
  return toLegal(wish, input.legal);
}

/**
 * Turns a wish into a legal intent. Bets and raises are clamped into [minTo, maxTo] (and become a
 * call or check when raising isn't allowed); a bot never folds when checking is free.
 */
export function toLegal(wish: Wish, legal: LegalActions): ActionIntent {
  if (wish.type === 'raise') {
    if (legal.canBet || legal.canRaise) {
      const amount = Math.min(legal.maxTo, Math.max(legal.minTo, Math.round(wish.to)));
      return { type: legal.canBet ? 'bet' : 'raise', amount };
    }
    return legal.canCall ? { type: 'call' } : { type: 'check' };
  }
  if (wish.type === 'call') return legal.canCall ? { type: 'call' } : { type: 'check' };
  return legal.canCheck ? { type: 'check' } : { type: 'fold' };
}

// ----------------------------------------------------------------- Easy

/** Loose and passive: plays most hands, calls a lot, seldom raises. */
function easyPreflop(spot: Spot, rng: Rng): Wish {
  const score = preflopScore(spot.hole);
  if (score >= 10 && rng() < 0.3) return raiseTo(spot, spot.level * 3);
  if (spot.legal.canCheck) return CHECK;
  const price = spot.toCall / spot.depth;
  if (price <= 0.1) return score >= 1 || rng() < 0.7 ? CALL : FOLD;
  if (price <= 0.35) return score >= 5 || rng() < 0.35 ? CALL : FOLD;
  return score >= 9 || rng() < 0.1 ? CALL : FOLD;
}

function easyPostflop(spot: Spot, rng: Rng): Wish {
  const equity = estimateEquity(spot.hole, spot.view.board, spot.opponents, EQUITY_TRIALS.easy, rng);
  const strong = strongAt(spot.opponents);
  if (spot.toCall === 0) {
    if (equity >= strong && rng() < 0.35) return potSized(spot, 0.5);
    return either(rng, 0.04, potSized(spot, 0.4), CHECK); // a stab now and then
  }
  if (equity >= strong && rng() < 0.12) return { type: 'raise', to: spot.legal.minTo };
  const potOdds = spot.toCall / (spot.pot + spot.toCall);
  if (equity >= potOdds * 0.7) return CALL; // calls far too often
  return either(rng, 0.2, CALL, FOLD);
}

// --------------------------------------------------------------- Medium

/**
 * Starting-hand tiers by Chen score. The bar to open drops with fewer players left to act (late
 * position, short tables); ±1 point of noise keeps edge hands from following a fixed pattern.
 */
function mediumPreflop(spot: Spot, rng: Rng): Wish {
  const { view, bigBlind, legal } = spot;
  const score = preflopScore(spot.hole) + (rng() - 0.5) * 2;
  const behind = playersBehind(spot);
  const openAt = view.players.length === 2 ? 3 : 3.5 + 1.2 * behind;
  const stackInBlinds = spot.depth / bigBlind;

  if (spot.level <= bigBlind) {
    // Unopened: only the blinds, maybe some limpers.
    const limpers = view.players.filter(
      (p) => p !== spot.me && p.seat !== view.bbSeat && p.status !== 'folded' && p.committed >= bigBlind,
    ).length;
    if (legal.canCheck) {
      // The big blind's option: raise only good hands, otherwise see a free flop.
      return score >= Math.max(openAt, 7) + limpers ? raiseTo(spot, bigBlind * (3 + limpers)) : CHECK;
    }
    if (stackInBlinds <= 12 && score >= openAt - 1 + limpers) return raiseTo(spot, spot.depth); // short: push or fold
    if (score >= openAt + limpers) return raiseTo(spot, bigBlind * (2.5 + rng() * 0.5 + limpers));
    if (score >= openAt - 2 && spot.toCall <= bigBlind / 2) return either(rng, 0.6, CALL, FOLD); // cheap completion
    return FOLD;
  }

  // Facing a raise: re-raise the best hands, call with good ones at a fair price, fold the rest.
  const price = spot.toCall / spot.depth;
  const potOdds = spot.toCall / (spot.pot + spot.toCall);
  const reraises = spot.level > bigBlind * 8 ? 1 : 0; // already a re-raise: tighten
  if (score >= 11 + reraises) {
    return either(rng, 0.85, raiseTo(spot, spot.level * 3), CALL); // sometimes just call a monster
  }
  const callAt = 7 + reraises + (price > 0.3 ? 2 : price > 0.12 ? 1 : 0) - (potOdds < 0.25 ? 1 : 0);
  return score >= callAt ? CALL : FOLD;
}

/**
 * Equity from a Monte Carlo run-out against the players still in, compared with the pot odds.
 * Bets for value at about half to three-quarters of the pot and bluffs now and then, more often
 * against a single opponent.
 */
function mediumPostflop(spot: Spot, rng: Rng): Wish {
  const { opponents } = spot;
  const equity = estimateEquity(spot.hole, spot.view.board, opponents, EQUITY_TRIALS.medium, rng);
  const strong = strongAt(opponents);
  const value = Math.min(0.62, 1.2 / (opponents + 1) + 0.02);
  const valueBet = () => potSized(spot, 0.5 + rng() * 0.25);

  if (spot.toCall === 0) {
    if (equity >= strong) return either(rng, 0.8, valueBet(), CHECK); // sometimes slow-play
    if (equity >= value) return either(rng, 0.55, valueBet(), CHECK);
    const bluff = opponents === 1 ? 0.14 : opponents === 2 ? 0.07 : 0.02;
    return either(rng, bluff, potSized(spot, 0.5 + rng() * 0.2), CHECK);
  }

  const potOdds = spot.toCall / (spot.pot + spot.toCall);
  // Their bet says their hand is better than random: ask for a margin, more when it risks the stack.
  const needed = potOdds + 0.05 + (spot.toCall > spot.me.stack / 2 ? 0.1 : 0);
  if (equity >= strong && equity >= needed) return either(rng, 0.6, potSized(spot, 0.6 + rng() * 0.3), CALL);
  if (equity >= needed) return CALL;
  if (opponents === 1 && spot.view.street !== 'river' && rng() < 0.04) return potSized(spot, 0.7); // rare bluff-raise
  return FOLD;
}
