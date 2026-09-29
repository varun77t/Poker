import type { BotLevel } from './constants';
import type { GameView } from './game';
import type { RoomSettings } from './schemas';

/**
 * What clients receive. These are projections built per player on the server; they never contain
 * hidden information. See docs/architecture.md §8.3.
 */

export type PlayerId = string;
export type RoomStatus = 'waiting' | 'playing' | 'finished';

/** Returned by POST /api/session. */
export interface SessionInfo {
  playerId: PlayerId;
  sessionToken: string;
  displayName: string;
}

export interface SeatView {
  seat: number;
  playerId: PlayerId;
  /** With a " (2)" suffix when another seated player has the same name. */
  displayName: string;
  /** Chips in front of the player. During a hand: what they have left behind (not yet in the pot). */
  stack: number;
  connected: boolean;
  /** Joined while a game was running; dealt in from the next hand. */
  waitingForNextHand: boolean;
  /**
   * Out of chips and not playing a hand (R-10.1), so not dealt in. With rebuys on, this player may
   * rebuy now (`game:rebuy`); the chips play from the next hand.
   */
  busted: boolean;
  /** Left the room during the current hand (folded); the seat is freed before the next hand. */
  leaving: boolean;
  /** A computer player the host added (§3.7). Always connected; never the host. */
  isBot: boolean;
  /** The bot's level; null for people. */
  botLevel: BotLevel | null;
}

/** The running game (room status `playing`). */
export interface TableView {
  /** Server time (epoch ms) when the next hand is dealt, during the pause after a hand; else null. */
  nextHandAt: number | null;
  /**
   * No hand can be dealt until someone joins, rebuys or reconnects, or the host ends the game: fewer
   * than 2 players have chips (R-10.4), or bots would play without a connected person who has chips
   * (R-10.6). With rebuys off a game nobody can play on ends instead.
   */
  waitingForPlayers: boolean;
  /** The host ended the game: it finishes once the current hand (and its results pause) is over. */
  endingAfterHand: boolean;
}

/** One line of the finished screen: everyone dealt into at least one hand of the game, including players who left. */
export interface FinalResult {
  playerId: PlayerId;
  displayName: string;
  /** Chips at the end of the game, or when the player left it. */
  finalStack: number;
  /** Starting stack plus every rebuy. */
  totalBuyIn: number;
  rebuys: number;
  /** finalStack − totalBuyIn. Across all lines this sums to zero. */
  net: number;
  /** The bot's level; null for people. */
  botLevel: BotLevel | null;
}

export interface RoomView {
  code: string;
  status: RoomStatus;
  hostId: PlayerId;
  settings: RoomSettings;
  /** The receiving player's id. */
  youId: PlayerId;
  /** Always MAX_SEATS entries; null is an open seat. */
  seats: (SeatView | null)[];
  /** Present while the room is `playing`. */
  table: TableView | null;
  /** Present while the room is `finished`: ranked by net result, best first. */
  finalResults: FinalResult[] | null;
}

/** The `state` event payload. `version` increases on every room change; drop older snapshots. */
export interface TableSnapshot {
  version: number;
  /**
   * Server clock (epoch ms) when this snapshot was sent. Compare it with the client's clock to
   * correct `turnDeadline` and `nextHandAt` for clock differences between machines.
   */
  serverTime: number;
  room: RoomView;
  /** The hand being played, or the one just finished (during the results pause); null otherwise. */
  game: GameView | null;
}
