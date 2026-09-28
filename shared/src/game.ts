import type { Card } from './cards';
import type { PlayerId } from './views';

/**
 * Types for a hand in progress, as players see it. The server's engine produces these through
 * `toGameView()` (server/src/engine/view.ts), the only place hidden cards are filtered out.
 * Rules: docs/game-rules.md.
 */

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

/** `active` can still act; `folded` and `allIn` never act again this hand. */
export type HandPlayerStatus = 'active' | 'folded' | 'allIn';

/** Client intents. `bet`/`raise` amounts are the total for the street ("raise TO"), R-4.1. */
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allIn';

export interface ActionIntent {
  type: ActionType;
  /** Required for `bet` and `raise`, forbidden otherwise. */
  amount?: number;
}

/** What the player to act may do (R-4). The client builds its buttons and slider only from this. */
export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  /** Chips a call adds (0 when there is nothing to call). */
  callAmount: number;
  canBet: boolean;
  canRaise: boolean;
  /** Bounds of the street total for whichever of bet or raise is available; both 0 when neither is. */
  minTo: number;
  maxTo: number;
}

/** A player's most recent action on the current street. `allIn` actions are recorded as what they resolved to. */
export interface LastAction {
  type: 'fold' | 'check' | 'call' | 'bet' | 'raise';
  /** Street total after the action, for call/bet/raise. */
  amount?: number;
  allIn: boolean;
}

export type HandCategory =
  | 'highCard'
  | 'pair'
  | 'twoPair'
  | 'trips'
  | 'straight'
  | 'flush'
  | 'fullHouse'
  | 'quads'
  | 'straightFlush';

export interface PotView {
  amount: number;
  eligibleSeats: number[];
}

export interface PotResult extends PotView {
  winners: { seat: number; playerId: PlayerId; amount: number }[];
}

/** A hand revealed at showdown (R-7.3). Folded hands never appear. */
export interface ShownHand {
  seat: number;
  playerId: PlayerId;
  holeCards: [Card, Card];
  best5: Card[];
  category: HandCategory;
  /** e.g. "Full House, Kings over Sevens". */
  label: string;
}

export interface HandResult {
  /** Everyone else folded (R-5.4): nothing is revealed. */
  wonByFold: boolean;
  pots: PotResult[];
  shown: ShownHand[];
}

export interface GamePlayerView {
  seat: number;
  playerId: PlayerId;
  stack: number;
  /** Chips put in on the current street. */
  committed: number;
  status: HandPlayerStatus;
  lastAction: LastAction | null;
  /** Always the viewer's own cards; anyone else's only once revealed (R-5.8, R-7.3). */
  holeCards: [Card, Card] | null;
}

export interface GameView {
  handId: number;
  /** Increases on every change to the hand. Actions must echo it (stale ones are rejected). */
  seq: number;
  street: Street;
  board: Card[];
  /** Pots from previous streets (R-6.5); empty once the hand is over (see `result`). */
  pots: PotView[];
  buttonSeat: number;
  sbSeat: number;
  bbSeat: number;
  toActSeat: number | null;
  /** Epoch ms when the current turn times out. Set by the table controller. */
  turnDeadline: number | null;
  players: GamePlayerView[];
  /** The viewer's options, only on their turn. */
  legalActions: LegalActions | null;
  result: HandResult | null;
}
