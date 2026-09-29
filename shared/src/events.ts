import type {
  AddBotPayload,
  CreateRoomPayload,
  EmptyPayload,
  GameActionPayload,
  JoinRoomPayload,
  RemoveBotPayload,
  UpdateSettingsPayload,
} from './schemas';
import type { TableSnapshot } from './views';

/**
 * Socket.IO event contract. Both server and client are typed against these maps.
 * Human-readable reference: docs/socket-events.md.
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

export interface RoomCodeResult {
  code: string;
}

export interface SeatResult {
  seat: number;
}

export interface SyncResult {
  /** The room the player is seated in, if any. A `state` event for it follows. */
  roomCode: string | null;
}

export interface ClientToServerEvents {
  'sys:ping': (payload: EmptyPayload, ack: AckCallback<PingResult>) => void;
  'sync:request': (payload: EmptyPayload, ack: AckCallback<SyncResult>) => void;
  'room:create': (payload: CreateRoomPayload, ack: AckCallback<RoomCodeResult>) => void;
  'room:join': (payload: JoinRoomPayload, ack: AckCallback<RoomCodeResult>) => void;
  'room:leave': (payload: EmptyPayload, ack: AckCallback) => void;
  'room:updateSettings': (payload: UpdateSettingsPayload, ack: AckCallback) => void;
  'room:addBot': (payload: AddBotPayload, ack: AckCallback<SeatResult>) => void;
  'room:removeBot': (payload: RemoveBotPayload, ack: AckCallback) => void;
  'game:start': (payload: EmptyPayload, ack: AckCallback) => void;
  'game:action': (payload: GameActionPayload, ack: AckCallback) => void;
  'game:rebuy': (payload: EmptyPayload, ack: AckCallback) => void;
  'game:end': (payload: EmptyPayload, ack: AckCallback) => void;
}

export interface ServerToClientEvents {
  /** Full per-player snapshot of the room the player is seated in. */
  state: (snapshot: TableSnapshot) => void;
  /** This connection was superseded by a newer one for the same session (another tab). */
  'session:replaced': (payload: EmptyPayload) => void;
}

export type ClientEventName = keyof ClientToServerEvents;
/** Payload type of a client→server event. */
export type EventPayload<E extends ClientEventName> = Parameters<ClientToServerEvents[E]>[0];
/** Full ack response (`Ack<T>`) of a client→server event. */
export type EventAck<E extends ClientEventName> = Parameters<Parameters<ClientToServerEvents[E]>[1]>[0];
/** Success data carried by an event's ack. */
export type EventAckData<E extends ClientEventName> = Extract<EventAck<E>, { ok: true }>['data'];

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- nothing server-to-server
export interface InterServerEvents {}

/** Set by the handshake middleware. The only source of player identity on the server. */
export interface SocketData {
  playerId: string;
}

/** Error message the handshake middleware uses when a session token is missing, unknown or expired. */
export const AUTH_INVALID = 'AUTH_INVALID';
