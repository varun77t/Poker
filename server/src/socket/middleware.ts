import { AUTH_INVALID } from '@poker/shared';
import type { SessionStore } from '../sessions/sessionStore';
import type { IoSocket } from './types';

/**
 * Handshake auth: resolves `auth.token` to a session and pins the player's identity on the socket.
 * `socket.data.playerId` is the only identity handlers may use; payloads never carry identity.
 */
export function authMiddleware(sessions: SessionStore) {
  return (socket: IoSocket, next: (err?: Error) => void): void => {
    const auth: unknown = socket.handshake.auth;
    const token = typeof auth === 'object' && auth !== null ? (auth as Record<string, unknown>).token : undefined;
    const session = sessions.resolve(token);
    if (!session) {
      next(new Error(AUTH_INVALID));
      return;
    }
    socket.data.playerId = session.playerId;
    next();
  };
}
