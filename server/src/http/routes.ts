import { Router } from 'express';

export interface HttpDeps {
  getSocketCount: () => number;
}

export function createHttpRouter(deps: HttpDeps): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true, uptime: Math.round(process.uptime()), sockets: deps.getSocketCount() });
  });

  // Unknown API routes get a JSON 404 rather than falling through to the client app.
  router.use('/api', (_req, res) => {
    res.status(404).json({ ok: false, error: 'NOT_FOUND' });
  });

  return router;
}
