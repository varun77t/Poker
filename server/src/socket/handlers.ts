import {
  CreateRoomPayloadSchema,
  EmptyPayloadSchema,
  JoinRoomPayloadSchema,
  UpdateSettingsPayloadSchema,
  type PlayerId,
} from '@poker/shared';
import type { Clock } from '../clock';
import { DomainError } from '../errors';
import type { RateLimiter } from '../rateLimiter';
import type { PlayerRef, RoomManager } from '../rooms/roomManager';
import type { SessionStore } from '../sessions/sessionStore';
import type { Broadcaster } from './broadcaster';
import type { createGuard } from './guard';
import type { IoSocket } from './types';

export interface HandlerDeps {
  clock: Clock;
  rooms: RoomManager;
  sessions: SessionStore;
  broadcaster: Broadcaster;
  guard: ReturnType<typeof createGuard>;
  joinLimiter: RateLimiter;
}

/** Thin mapping from events to domain calls. No business rules here. */
export function registerHandlers(socket: IoSocket, deps: HandlerDeps): void {
  const { rooms, sessions, broadcaster, joinLimiter, clock } = deps;
  const on = deps.guard(socket);

  const playerRef = (playerId: PlayerId): PlayerRef => {
    const session = sessions.get(playerId);
    if (!session) throw new Error(`No session for connected player ${playerId}`);
    return { playerId, displayName: session.displayName };
  };

  on('sys:ping', EmptyPayloadSchema, () => ({ serverTime: clock.now() }));

  on('sync:request', EmptyPayloadSchema, ({ playerId }) => {
    const room = rooms.getRoomOf(playerId);
    if (room) broadcaster.sendTo(playerId, room);
    return { roomCode: room?.code ?? null };
  });

  on('room:create', CreateRoomPayloadSchema, ({ playerId }, { settings }) => {
    const room = rooms.create(playerRef(playerId), settings);
    return { code: room.code };
  });

  on('room:join', JoinRoomPayloadSchema, ({ playerId }, { code }) => {
    if (!joinLimiter.take(playerId)) {
      throw new DomainError('RATE_LIMITED', 'Too many join attempts. Wait a minute and try again.');
    }
    const room = rooms.join(playerRef(playerId), code);
    return { code: room.code };
  });

  on('room:leave', EmptyPayloadSchema, ({ playerId }) => {
    rooms.leave(playerId);
    return {};
  });

  on('room:updateSettings', UpdateSettingsPayloadSchema, ({ playerId }, { settings }) => {
    rooms.updateSettings(playerId, settings);
    return {};
  });

  on('game:start', EmptyPayloadSchema, ({ playerId }) => {
    rooms.start(playerId);
    return {};
  });
}
