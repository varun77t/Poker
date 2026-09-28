import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppServer } from './app';
import { listenPort, loadConfig } from './config';
import { createLogger } from './logger';

// This entry file lives one directory below the server package in both src/ (dev) and dist/ (build),
// so the repo root resolves the same way in both.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Local development convenience; real environment variables take precedence over .env values.
const envFile = path.join(repoRoot, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);

const { httpServer, close } = createAppServer({
  config,
  logger,
  clientDistDir: config.NODE_ENV === 'production' ? path.join(repoRoot, 'client', 'dist') : null,
});

const port = listenPort(config);
httpServer.listen(port, () => {
  logger.info(`Server listening on http://localhost:${port} (${config.NODE_ENV})`);
});

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down`);
  // Stops timers, closes all sockets and the underlying HTTP server.
  void close().then(() => process.exit(0));
  setTimeout(() => {
    logger.error('Forced exit after shutdown timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
