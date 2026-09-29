import type { BotLevel, Card, GamePlayerView, GameView, LegalActions } from '@poker/shared';
import type { Reads } from './reads';
import type { Rng } from './rng';

/** Shared by every bot level: the bot's read of the table on its turn, and bet sizing. */

export interface BotInput {
  level: BotLevel;
  /** toGameView(state, botId) on the bot's turn. */
  view: GameView;
  /** getLegalActions(state, botId). */
  legal: LegalActions;
  /** The room's big blind (public), for preflop bet sizes. */
  bigBlind: number;
  /** What this bot has learned about how each player plays (public actions only). Pro uses it. */
  reads?: Reads;
}

/** What a strategy wants; `toLegal` turns it into an intent the engine accepts. `raise` also means bet. */
export type Wish = { type: 'fold' | 'check' | 'call' } | { type: 'raise'; to: number };

export const FOLD: Wish = { type: 'fold' };
export const CHECK: Wish = { type: 'check' };
export const CALL: Wish = { type: 'call' };

/** The bot's read of the table on its turn. Everything here comes from the bot's own view. */
export interface Spot {
  view: GameView;
  legal: LegalActions;
  bigBlind: number;
  me: GamePlayerView;
  hole: [Card, Card];
  preflop: boolean;
  /** Everything in the middle, this street's bets included. */
  pot: number;
  /** The street's bet to match (preflop at least the big blind, R-2.6). */
  level: number;
  toCall: number;
  /** The bot's chips for this hand: behind plus already in on this street. */
  depth: number;
  /** Opponents still holding cards. */
  opponents: number;
}

export function readSpot({ view, legal, bigBlind }: BotInput): Spot {
  const me = view.players.find((p) => p.seat === view.toActSeat);
  if (!me?.holeCards) throw new Error('decide() called off the bot turn');
  const preflop = view.street === 'preflop';
  const committed = view.players.reduce((sum, p) => sum + p.committed, 0);
  const level = Math.max(preflop ? bigBlind : 0, ...view.players.map((p) => p.committed));
  return {
    view,
    legal,
    bigBlind,
    me,
    hole: me.holeCards,
    preflop,
    pot: view.pots.reduce((sum, pot) => sum + pot.amount, 0) + committed,
    level,
    toCall: legal.callAmount,
    depth: me.stack + me.committed,
    opponents: view.players.filter((p) => p !== me && p.status !== 'folded').length,
  };
}

// ----------------------------------------------------------------- sizing

/** A street total; anything within reach of the whole stack becomes all-in rather than leaving crumbs. */
export function raiseTo(spot: Spot, to: number): Wish {
  return { type: 'raise', to: to >= spot.depth * 0.8 ? spot.depth : to };
}

/** Bet `fraction` of the pot, or raise: call first, then add `fraction` of the pot after the call. */
export function potSized(spot: Spot, fraction: number): Wish {
  const to = spot.level === 0 ? spot.pot * fraction : spot.level + (spot.pot + spot.toCall) * fraction;
  return raiseTo(spot, to);
}

/** Probability-weighted choice between two wishes. */
export const either = (rng: Rng, p: number, a: Wish, b: Wish): Wish => (rng() < p ? a : b);

/** Equity that counts as a strong hand against this many opponents (a fair share is 1 / (n + 1)). */
export function strongAt(opponents: number): number {
  return Math.min(0.75, 1.6 / (opponents + 1));
}

/** Preflop: players still to act after the bot before the round closes at the big blind. */
export function playersBehind({ view, me }: Spot): number {
  if (me.seat === view.bbSeat) return 0;
  const seats = view.players
    .filter((p) => p.status !== 'folded')
    .map((p) => p.seat)
    .sort((a, b) => a - b);
  const from = seats.indexOf(me.seat);
  let behind = 0;
  for (let step = 1; step < seats.length; step++) {
    behind += 1;
    if (seats[(from + step) % seats.length] === view.bbSeat) break;
  }
  return behind;
}
