import { createServer, type Server as HttpServer } from 'node:http';
import { MAX_SOCKET_PAYLOAD_BYTES } from '@poker/shared';
import express, { type ErrorRequestHandler, type Express } from 'express';
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
}

export interface AppServer {
  app: Express;
  httpServer: HttpServer;
  io: IoServer;
  sessions: SessionStore;
  rooms: RoomManager;
  /** Stops timers and closes Socket.IO and the HTTP server. */
  close(): Promise<void>;
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
  const broadcaster = new Broadcaster(connections);
  const rooms = new RoomManager({
    clock,
    timings,
    randomInt: options.randomInt,
    onRoomChanged: (room) => broadcaster.roomChanged(room),
    onRoomDeleted: (code) => logger.debug(`room ${code} deleted (empty)`),
  });

  const limiter = (l: { count: number; windowMs: number }) => new RateLimiter(clock, l.count, l.windowMs);
  const eventLimiter = limiter(limits.socketEvents);
  const joinLimiter = limiter(limits.roomJoins);
  const sessionLimiter = limiter(limits.sessionCreates);

  // HTTP
  const app = express();
  app.disable('x-powered-by');
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
    eventLimiter,
    joinLimiter,
  });

  // Housekeeping: expire idle sessions (dropping any seat they still hold) and prune idle rate-limit buckets.
  const stopSweeper = scheduleEvery(clock, timings.sessionSweepIntervalMs, () => {
    for (const playerId of sessions.sweep((id) => connections.has(id))) rooms.removePlayer(playerId);
    for (const l of [eventLimiter, joinLimiter, sessionLimiter]) l.sweep();
  });

  const close = () =>
    new Promise<void>((resolve) => {
      stopSweeper();
      rooms.dispose();
      void io.close(() => resolve());
    });

  return { app, httpServer, io, sessions, rooms, close };
}
