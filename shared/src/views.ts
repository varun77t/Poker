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
  stack: number;
  connected: boolean;
  /** Joined while a game was running; dealt in from the next hand. */
  waitingForNextHand: boolean;
  busted: boolean;
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
  finalResults: null;
}

/** The `state` event payload. `version` increases on every room change; drop older snapshots. */
export interface TableSnapshot {
  version: number;
  room: RoomView;
  /** Game view arrives in Phase 4. */
  game: null;
}
