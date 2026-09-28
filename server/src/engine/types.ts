import type {
  Card,
  HandCategory,
  HandPlayerStatus,
  HandResult,
  LastAction,
  PlayerId,
  Street,
} from '@poker/shared';

/**
 * Server-internal hand state. Never sent to clients as-is: `toGameView()` projects it per player.
 * Rules: docs/game-rules.md (rule IDs R-x.y).
 */

export interface HandPlayer {
  playerId: PlayerId;
  seat: number;
  stack: number;
  holeCards: [Card, Card];
  status: HandPlayerStatus;
  /** Chips put in on the current street. */
  committed: number;
  /** Chips put in during the whole hand, blinds included. Pots are built from this (R-6). */
  contributed: number;
  /** Has acted since action was last reopened. Posting a blind is not acting (R-5.6). */
  hasActed: boolean;
  /** The street's bet level right after this player's last action, for raise rights (R-4.5). */
  betLevelWhenLastActed: number;
  lastAction: LastAction | null;
}

/** `action`: waiting for `toActSeat`. `deal`: waiting for `advance()`. `none`: the hand is over. */
export type Awaiting = 'action' | 'deal' | 'none';

export interface HandState {
  handId: number;
  /** Increments on every change (action, deal, forced fold). Clients echo it with their actions. */
  seq: number;
  /** Σ starting stacks. Invariant: Σ(stack + contributed) during the hand, Σ stack after it (R-7.6). */
  totalChips: number;
  smallBlind: number;
  bigBlind: number;
  buttonSeat: number;
  sbSeat: number;
  bbSeat: number;
  street: Street;
  awaiting: Awaiting;
  /** Remaining cards, top first. Never leaves the server. */
  deck: Card[];
  board: Card[];
  /** Dealt-in players, ordered by seat. */
  players: HandPlayer[];
  /** What every active player must have committed this street (game-rules §1). */
  betLevel: number;
  /** Minimum raise increment: the last full bet or raise this street (R-4.4). */
  minRaise: number;
  toActSeat: number | null;
  /** No more betting is possible (R-5.8) or the hand reached showdown: non-folded hands are public. */
  allRevealed: boolean;
  result: HandResult | null;
  /** Public log of this hand. Contains no hidden cards. */
  log: EngineEvent[];
}

export interface CreateHandInput {
  handId: number;
  /** Eligible players (R-2.1): stack > 0, not waiting for the next hand. */
  players: { playerId: PlayerId; seat: number; stack: number }[];
  buttonSeat: number;
  smallBlind: number;
  bigBlind: number;
  /** Ordered deck, top card first (R-2.7). Use `shuffledDeck()` outside tests. */
  deck: Card[];
}

export type EngineEvent =
  | { type: 'handStarted'; handId: number; buttonSeat: number; sbSeat: number; bbSeat: number }
  | { type: 'blindPosted'; seat: number; blind: 'small' | 'big'; amount: number; allIn: boolean }
  | { type: 'action'; seat: number; action: LastAction }
  | { type: 'forcedFold'; seat: number }
  | { type: 'uncalledReturned'; seat: number; amount: number }
  | { type: 'bettingClosed'; street: Street }
  | { type: 'handsRevealed'; seats: number[] }
  | { type: 'streetDealt'; street: Street; cards: Card[] }
  | { type: 'potAwarded'; potIndex: number; amount: number; winners: { seat: number; amount: number }[] }
  /** R-6.4: chips no remaining player was eligible for were merged into a lower pot (only after a forced fold). */
  | { type: 'deadChipsMerged'; layers: number }
  | { type: 'handEnded'; wonByFold: boolean };

/** Codes match the shared ErrorCode union, so the table controller can pass them straight to acks. */
export type EngineErrorCode = 'NOT_YOUR_TURN' | 'ILLEGAL_ACTION' | 'INVALID_AMOUNT' | 'INVALID_STATE';

export interface EngineError {
  code: EngineErrorCode;
  message: string;
}

export type ActionResult =
  | { ok: true; state: HandState; events: EngineEvent[] }
  | { ok: false; error: EngineError };

export interface Transition {
  state: HandState;
  events: EngineEvent[];
}

/** A player's best hand. Higher `rankValue` wins; equal values tie (R-8). */
export interface HandValue {
  category: HandCategory;
  rankValue: number;
  best5: Card[];
  label: string;
}
