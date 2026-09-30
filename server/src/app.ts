import { createServer, type Server as HttpServer } from 'node:http';
import { MAX_SOCKET_PAYLOAD_BYTES } from '@poker/shared';
import express, { type ErrorRequestHandler, type Express } from 'express';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { scheduleEvery, systemClock, type Clock } from './clock';
import type { Config } from './config';
import { createHttpRouter } from './http/routes';
import { createStaticRouter } from './http/static';
import type { Logger } from './logger';
import { DEFAULT_RATE_LIMITS, DEFAULT_TIMINGS, type RateLimits, type Timings } from './policies';
import { RateLimiter } from './rateLimiter';
import type { RandomInt } from './rooms/roomCode';
import { RoomManager } from './rooms/roomManager';
import { SessionStore } from './sessions/sessionStore';
import { registerSocketHandlers } from './socket';
import { Broadcaster } from './socket/broadcaster';
import { Connections } from './socket/connections';
import { createGuard } from './socket/guard';
import type { IoServer } from './socket/types';
import type { NewDeck } from './table/tableController';

export interface AppServerOptions {
  config: Config;
  logger: Logger;
  /** Absolute path to client/dist, or null to not serve the client (development, tests). */
  clientDistDir: string | null;
  /** Test hooks. */
  clock?: Clock;
  timings?: Partial<Timings>;
  rateLimits?: Partial<RateLimits>;
  randomInt?: RandomInt;
  /** The deck for each new hand, top card first (default: a secure shuffle). */
  newDeck?: NewDeck;
}

export interface AppServer {
  app: Express;
  httpServer: HttpServer;
  io: IoServer;
  sessions: SessionStore;
  rooms: RoomManager;
  /**
   * Stops timers and closes Socket.IO and the HTTP server. With `notify`, every connected client is
   * first told the server is going away (`sys:shutdown`), so it can say so instead of just "reconnecting".
   */
  close(options?: { notify?: boolean }): Promise<void>;
}

/** Builds the Express app, HTTP server and Socket.IO server without listening (tests call this too). */
export function createAppServer(options: AppServerOptions): AppServer {
  const { logger, clientDistDir } = options;
  const clock = options.clock ?? systemClock;
  const timings: Timings = { ...DEFAULT_TIMINGS, ...options.timings };
  const limits: RateLimits = { ...DEFAULT_RATE_LIMITS, ...options.rateLimits };

  // Built first so a missing client build fails fast, before any server objects exist.
  const staticRouter = clientDistDir ? createStaticRouter(clientDistDir) : null;

  // Domain
  const sessions = new SessionStore(clock, timings.sessionTtlMs);
  const connections = new Connections();
  const broadcaster = new Broadcaster(connections, clock);
  const rooms = new RoomManager({
    clock,
    timings,
    randomInt: options.randomInt,
    newDeck: options.newDeck,
    logger,
    onRoomChanged: (room) => broadcaster.roomChanged(room),
    onRoomDeleted: (code) => logger.debug(`room ${code} deleted (empty)`),
  });

  const limiter = (l: { count: number; windowMs: number }) => new RateLimiter(clock, l.count, l.windowMs);
  const eventLimiter = limiter(limits.socketEvents);
  const joinLimiter = limiter(limits.roomJoins);
  const joinIpLimiter = limiter(limits.roomJoinsPerIp);
  const createLimiter = limiter(limits.roomCreates);
  const sessionLimiter = limiter(limits.sessionCreates);

  // HTTP
  const app = express();
  app.disable('x-powered-by');
  // Behind the hosting platform's proxy, req.ip is the visitor (per-IP limits), not the proxy.
  app.set('trust proxy', options.config.TRUST_PROXY);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Everything is same-origin: the built client, its fonts, and the Socket.IO connection.
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // React style attributes (positions, timer ring)
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          // The platform terminates HTTPS; a local production run is plain http://localhost.
          upgradeInsecureRequests: null,
        },
      },
      // HSTS only means something over HTTPS, which the platform provides; browsers ignore it on http.
      strictTransportSecurity: { maxAge: 15_552_000, includeSubDomains: false },
    }),
  );
  app.use(express.json({ limit: '10kb' }));

  const httpServer = createServer(app);
  const io: IoServer = new Server(httpServer, {
    serveClient: false,
    maxHttpBufferSize: MAX_SOCKET_PAYLOAD_BYTES,
    // No CORS config: the browser always talks to one origin (Vite proxy in dev, same server in prod).
  });

  app.use(createHttpRouter({ sessions, rooms, sessionLimiter, getSocketCount: () => io.engine.clientsCount }));
  if (staticRouter) app.use(staticRouter);

  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: 'NOT_FOUND' });
  });

  const errorHandler: ErrorRequestHandler = (err: { status?: number; type?: string }, _req, res, _next) => {
    // Malformed or oversized JSON bodies are client errors, not server faults.
    if (typeof err.status === 'number' && err.status >= 400 && err.status < 500) {
      res.status(err.status).json({ ok: false, error: 'INVALID_PAYLOAD', message: 'Invalid request body.' });
      return;
    }
    logger.error('Unhandled HTTP error', err);
    res.status(500).json({ ok: false, error: 'INTERNAL' });
  };
  app.use(errorHandler);

  // Socket.IO
  const guard = createGuard({
    logger,
    limiter: eventLimiter,
    maxStrikes: limits.maxStrikes,
    onActivity: (playerId) => sessions.touch(playerId),
  });
  registerSocketHandlers(io, {
    logger,
    clock,
    sessions,
    rooms,
    connections,
    broadcaster,
    guard,
    joinLimiter,
    joinIpLimiter,
    createLimiter,
    trustedHops: options.config.TRUST_PROXY,
  });

  // Housekeeping: expire idle sessions (dropping any seat they still hold) and prune idle rate-limit buckets.
  const stopSweeper = scheduleEvery(clock, timings.sessionSweepIntervalMs, () => {
    for (const playerId of sessions.sweep((id) => connections.has(id))) rooms.removePlayer(playerId);
    for (const l of [eventLimiter, joinLimiter, joinIpLimiter, createLimiter, sessionLimiter]) l.sweep();
  });

  const close = async ({ notify = false } = {}) => {
    stopSweeper();
    rooms.dispose();
    if (notify) {
      io.emit('sys:shutdown', {});
      // A moment for the notice to reach clients before their sockets close.
      await new Promise((r) => setTimeout(r, 300));
    }
    await new Promise<void>((resolve) => void io.close(() => resolve()));
  };

  return { app, httpServer, io, sessions, rooms, close };
}
