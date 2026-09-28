import { createServer, type Server as HttpServer } from 'node:http';
import { MAX_SOCKET_PAYLOAD_BYTES } from '@poker/shared';
import express, { type ErrorRequestHandler, type Express } from 'express';
import { Server } from 'socket.io';
import type { Config } from './config';
import { createHttpRouter } from './http/routes';
import { createStaticRouter } from './http/static';
import type { Logger } from './logger';
import { registerSocketHandlers } from './socket';
import type { IoServer } from './socket/types';

export interface AppServerOptions {
  config: Config;
  logger: Logger;
  /** Absolute path to client/dist, or null to not serve the client (development, tests). */
  clientDistDir: string | null;
}

export interface AppServer {
  app: Express;
  httpServer: HttpServer;
  io: IoServer;
}

/** Builds the Express app, HTTP server and Socket.IO server without listening (tests call this too). */
export function createAppServer({ logger, clientDistDir }: AppServerOptions): AppServer {
  // Built first so a missing client build fails fast, before any server objects exist.
  const staticRouter = clientDistDir ? createStaticRouter(clientDistDir) : null;

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));

  const httpServer = createServer(app);
  const io: IoServer = new Server(httpServer, {
    serveClient: false,
    maxHttpBufferSize: MAX_SOCKET_PAYLOAD_BYTES,
    // No CORS config: the browser always talks to one origin (Vite proxy in dev, same server in prod).
  });

  app.use(createHttpRouter({ getSocketCount: () => io.engine.clientsCount }));
  if (staticRouter) app.use(staticRouter);

  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: 'NOT_FOUND' });
  });

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    logger.error('Unhandled HTTP error', err);
    res.status(500).json({ ok: false, error: 'INTERNAL' });
  };
  app.use(errorHandler);

  registerSocketHandlers(io, logger);

  return { app, httpServer, io };
}
