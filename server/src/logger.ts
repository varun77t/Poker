import type { Config } from './config';

const LEVELS = { fatal: 0, error: 1, warn: 2, info: 3, debug: 4 } as const;
type Level = keyof typeof LEVELS;

export type Logger = Record<Level, (message: string, meta?: unknown) => void>;

/** Errors become plain objects (JSON.stringify drops their fields); anything else passes through. */
function serialize(meta: unknown): unknown {
  if (meta instanceof Error) return { name: meta.name, message: meta.message, stack: meta.stack };
  return meta;
}

/**
 * Leveled logger. `json` writes one object per line ({ time, level, msg, meta }) for the hosting
 * platform's log viewer; `pretty` writes a readable line for development. Warnings and worse go to
 * stderr. Never pass session tokens or other secrets as meta.
 */
export function createLogger(level: Config['LOG_LEVEL'], format: 'json' | 'pretty' = 'pretty'): Logger {
  const threshold = LEVELS[level];
  const make =
    (lvl: Level) =>
    (message: string, meta?: unknown): void => {
      if (LEVELS[lvl] > threshold) return;
      const out = LEVELS[lvl] <= LEVELS.warn ? console.error : console.log;
      const time = new Date().toISOString();
      if (format === 'json') {
        out(JSON.stringify({ time, level: lvl, msg: message, ...(meta === undefined ? {} : { meta: serialize(meta) }) }));
        return;
      }
      const line = `${time} ${lvl.toUpperCase().padEnd(5)} ${message}`;
      if (meta === undefined) out(line);
      else out(line, meta);
    };
  return { fatal: make('fatal'), error: make('error'), warn: make('warn'), info: make('info'), debug: make('debug') };
}

/** Logger for tests: drops everything. */
export const silentLogger: Logger = {
  fatal: () => {},
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
};
