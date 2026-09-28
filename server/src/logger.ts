import type { Config } from './config';

const LEVELS = { fatal: 0, error: 1, warn: 2, info: 3, debug: 4 } as const;
type Level = keyof typeof LEVELS;

export type Logger = Record<Level, (message: string, meta?: unknown) => void>;

/** Minimal leveled logger. Replaced by structured logging in the deployment phase. */
export function createLogger(level: Config['LOG_LEVEL']): Logger {
  const threshold = LEVELS[level];
  const make =
    (lvl: Level) =>
    (message: string, meta?: unknown): void => {
      if (LEVELS[lvl] > threshold) return;
      const line = `${new Date().toISOString()} ${lvl.toUpperCase().padEnd(5)} ${message}`;
      const out = LEVELS[lvl] <= LEVELS.warn ? console.error : console.log;
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
