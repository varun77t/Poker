import { PingPayloadSchema } from '@poker/shared';
import type { Logger } from '../logger';
import type { IoServer } from './types';

/**
 * Registers Socket.IO handlers. Phase 1 has only the system ping; the generic guard
 * (rate limit → schema → identity) and room/game handlers arrive in Phase 2.
 */
export function registerSocketHandlers(io: IoServer, logger: Logger): void {
  io.on('connection', (socket) => {
    logger.debug(`socket connected ${socket.id}`);
    socket.emit('sys:hello', { serverTime: Date.now() });

    socket.on('sys:ping', (payload, ack) => {
      if (typeof ack !== 'function') return;
      if (!PingPayloadSchema.safeParse(payload).success) {
        ack({ ok: false, error: 'INVALID_PAYLOAD', message: 'Invalid payload.' });
        return;
      }
      ack({ ok: true, data: { serverTime: Date.now() } });
    });

    socket.on('disconnect', (reason) => {
      logger.debug(`socket disconnected ${socket.id} (${reason})`);
    });
  });
}
