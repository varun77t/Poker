/** Cancels a scheduled callback. Safe to call more than once. */
export type Cancel = () => void;

/**
 * Time source and scheduler used by every server timer (lobby grace, room TTL, session expiry, and
 * later turn timers). Injected so tests can drive time with a fake clock.
 */
export interface Clock {
  now(): number;
  schedule(delayMs: number, fn: () => void): Cancel;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  schedule(delayMs, fn) {
    const timer = setTimeout(fn, delayMs);
    // Domain timers must never keep the process alive during shutdown.
    timer.unref();
    return () => clearTimeout(timer);
  },
};

/** Runs `fn` every `intervalMs` until the returned function is called. */
export function scheduleEvery(clock: Clock, intervalMs: number, fn: () => void): Cancel {
  let cancel: Cancel = () => {};
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    fn();
    cancel = clock.schedule(intervalMs, tick);
  };
  cancel = clock.schedule(intervalMs, tick);
  return () => {
    stopped = true;
    cancel();
  };
}
