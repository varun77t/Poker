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
  /** Out of chips between hands (R-10.1), so not dealt in. */
  busted: boolean;
  /** Left the room during the current hand (folded); the seat is freed before the next hand. */
  leaving: boolean;
}

/** The running game (room status `playing`). */
export interface TableView {
  /** Server time (epoch ms) when the next hand is dealt, during the pause after a hand; else null. */
  nextHandAt: number | null;
  /** Fewer than 2 players have chips, so no hand can be dealt until someone joins (R-10.4). */
  waitingForPlayers: boolean;
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
  finalResults: null;
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
