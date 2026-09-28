import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { Router } from 'express';

/**
 * Serves the built client (client/dist) and falls back to index.html for client-side routes
 * such as /room/ABC123. Used in production only; in development Vite serves the client.
 */
export function createStaticRouter(clientDistDir: string): Router {
  const indexHtml = path.join(clientDistDir, 'index.html');
  if (!existsSync(indexHtml)) {
    throw new Error(`Client build not found at ${indexHtml}. Run "npm run build" first.`);
  }

  const router = Router();

  router.use(
    express.static(clientDistDir, {
      index: false,
      setHeaders(res, filePath) {
        // Vite emits content-hashed files under assets/, so they can be cached forever.
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );

  router.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });

  return router;
}
