import type { Ack, ClientEventName, EventAckData, PlayerId } from '@poker/shared';
import type { z } from 'zod';
import { DomainError } from '../errors';
import type { Logger } from '../logger';
import type { RateLimiter } from '../rateLimiter';
import type { IoSocket } from './types';

export interface HandlerContext {
  playerId: PlayerId;
  socket: IoSocket;
}

export interface GuardDeps {
  logger: Logger;
  limiter: RateLimiter;
  maxStrikes: number;
  onActivity: (playerId: PlayerId) => void;
}

/**
 * Wraps every client→server handler in the security pipeline from docs/architecture.md §9:
 * rate limit → ack required → strict zod parse → handler (identity from socket.data only) → ack.
 * DomainErrors become `{ ok: false, error, message }`; anything else is logged and reported as INTERNAL.
 */
export function createGuard(deps: GuardDeps) {
  return (socket: IoSocket) => {
    let strikes = 0;

    return function on<E extends ClientEventName, S extends z.ZodType>(
      event: E,
      schema: S,
      handler: (ctx: HandlerContext, payload: z.output<S>) => EventAckData<E>,
    ): void {
      const listener = (payload: unknown, ack: unknown): void => {
        if (!deps.limiter.take(socket.id)) {
          strikes += 1;
          if (strikes >= deps.maxStrikes) {
            deps.logger.warn(`Disconnecting ${socket.data.playerId}: sustained rate-limit violations`);
            socket.disconnect(true);
            return;
          }
          reply(ack, { ok: false, error: 'RATE_LIMITED', message: 'Slow down.' });
          return;
        }
        strikes = 0;
        if (typeof ack !== 'function') return; // every event requires an ack

        const parsed = schema.safeParse(payload);
        if (!parsed.success) {
          reply(ack, { ok: false, error: 'INVALID_PAYLOAD', message: 'Invalid request.' });
          return;
        }

        const ctx: HandlerContext = { playerId: socket.data.playerId, socket };
        deps.onActivity(ctx.playerId);
        try {
          reply(ack, { ok: true, data: handler(ctx, parsed.data) });
        } catch (err) {
          if (err instanceof DomainError) {
            reply(ack, { ok: false, error: err.code, message: err.message });
          } else {
            deps.logger.error(`Handler ${event} failed`, err);
            reply(ack, { ok: false, error: 'INTERNAL', message: 'Something went wrong.' });
          }
        }
      };
      // The typed listener signature is enforced by `handler`; the raw listener sees untrusted input.
      socket.on(event, listener as never);
    };
  };
}

function reply(ack: unknown, response: Ack<unknown>): void {
  if (typeof ack === 'function') (ack as (r: Ack<unknown>) => void)(response);
}
