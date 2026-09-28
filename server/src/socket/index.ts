import type { Logger } from '../logger';
import type { RateLimiter } from '../rateLimiter';
import type { RoomManager } from '../rooms/roomManager';
import type { SessionStore } from '../sessions/sessionStore';
import type { Broadcaster } from './broadcaster';
import type { Connections } from './connections';
import type { createGuard } from './guard';
import { registerHandlers, type HandlerDeps } from './handlers';
import { authMiddleware } from './middleware';
import type { IoServer } from './types';

export interface SocketDeps extends HandlerDeps {
  logger: Logger;
  sessions: SessionStore;
  rooms: RoomManager;
  connections: Connections;
  broadcaster: Broadcaster;
  guard: ReturnType<typeof createGuard>;
  eventLimiter: RateLimiter;
}

export function registerSocketHandlers(io: IoServer, deps: SocketDeps): void {
  const { logger, sessions, rooms, connections, broadcaster, eventLimiter } = deps;

  io.use(authMiddleware(sessions));

  io.on('connection', (socket) => {
    const { playerId } = socket.data;
    logger.debug(`player ${playerId} connected (${socket.id})`);

    // One live connection per player: the newest wins (e.g. the same session opened in another tab).
    const previous = connections.set(playerId, socket);
    if (previous) {
      previous.emit('session:replaced', {});
      previous.disconnect(true);
    }

    registerHandlers(socket, deps);

    // Reconnect: mark the seat connected (broadcasts on change) and make sure this socket has the room.
    const changed = rooms.setConnected(playerId, true);
    const room = rooms.getRoomOf(playerId);
    if (room && !changed) broadcaster.sendTo(playerId, room);

    socket.on('disconnect', (reason) => {
      logger.debug(`player ${playerId} disconnected (${socket.id}: ${reason})`);
      eventLimiter.delete(socket.id);
      sessions.touch(playerId);
      if (connections.release(playerId, socket)) rooms.setConnected(playerId, false);
    });
  });
}
