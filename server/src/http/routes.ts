import { CreateSessionBodySchema, type Ack, type SessionInfo } from '@poker/shared';
import { Router, type Request } from 'express';
import type { RateLimiter } from '../rateLimiter';
import type { RoomManager } from '../rooms/roomManager';
import { toSessionInfo, type SessionStore } from '../sessions/sessionStore';

export interface HttpDeps {
  sessions: SessionStore;
  rooms: RoomManager;
  sessionLimiter: RateLimiter;
  getSocketCount: () => number;
}

function bearerToken(req: Request): string | undefined {
  const header = req.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
}

export function createHttpRouter(deps: HttpDeps): Router {
  const { sessions, rooms, sessionLimiter } = deps;
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      uptime: Math.round(process.uptime()),
      sockets: deps.getSocketCount(),
      rooms: rooms.roomCount,
    });
  });

  /**
   * Creates a guest session, or renames the caller's session when a valid `Authorization: Bearer <token>`
   * is sent (same playerId, so seats are kept). Body: { displayName }.
   */
  router.post('/api/session', (req, res) => {
    const send = (status: number, body: Ack<SessionInfo>) => res.status(status).json(body);

    if (!sessionLimiter.take(req.ip ?? 'unknown')) {
      return send(429, { ok: false, error: 'RATE_LIMITED', message: 'Too many requests. Try again in a minute.' });
    }
    const parsed = CreateSessionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return send(400, { ok: false, error: 'INVALID_PAYLOAD', message: parsed.error.issues[0]?.message ?? 'Invalid name.' });
    }
    const { displayName } = parsed.data;

    const existing = sessions.resolve(bearerToken(req));
    if (existing) {
      sessions.rename(existing.playerId, displayName);
      rooms.rename(existing.playerId, displayName);
      return send(200, { ok: true, data: toSessionInfo(existing) });
    }
    return send(201, { ok: true, data: toSessionInfo(sessions.create(displayName)) });
  });

  // Unknown API routes get a JSON 404 rather than falling through to the client app.
  router.use('/api', (_req, res) => {
    res.status(404).json({ ok: false, error: 'NOT_FOUND' });
  });

  return router;
}
