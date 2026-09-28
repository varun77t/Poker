/**
 * Socket.IO event contract. Both server and client are typed against these maps.
 * Phase 1 only defines the system ping; room and game events arrive in Phases 2 and 4
 * (see docs/architecture.md §7, and docs/socket-events.md once it exists).
 */

export type ErrorCode =
  | 'INVALID_PAYLOAD'
  | 'RATE_LIMITED'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'NOT_IN_ROOM'
  | 'NOT_HOST'
  | 'NOT_ENOUGH_PLAYERS'
  | 'INVALID_STATE'
  | 'STALE_ACTION'
  | 'NOT_YOUR_TURN'
  | 'ILLEGAL_ACTION'
  | 'INVALID_AMOUNT'
  | 'REBUY_NOT_ALLOWED'
  | 'INTERNAL';

/** Every client→server event replies through an ack callback with this shape. */
export type Ack<T = Record<string, never>> =
  | { ok: true; data: T }
  | { ok: false; error: ErrorCode; message: string };

export type AckCallback<T = Record<string, never>> = (response: Ack<T>) => void;

export interface PingResult {
  serverTime: number;
}

export interface ClientToServerEvents {
  'sys:ping': (payload: Record<string, never>, ack: AckCallback<PingResult>) => void;
}

export interface ServerToClientEvents {
  'sys:hello': (payload: { serverTime: number }) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- nothing server-to-server yet
export interface InterServerEvents {}

/** Data the server attaches to each socket after the handshake (identity arrives in Phase 2). */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- filled in Phase 2
export interface SocketData {}
