/** Server timing and rate-limit policies (docs/architecture.md §9–10). Overridable in tests. */

export interface Timings {
  /** How long a disconnected player keeps their lobby seat. */
  lobbyDisconnectGraceMs: number;
  /** How long an empty room survives before it is deleted. */
  emptyRoomTtlMs: number;
  /** Idle time after which a guest session expires. */
  sessionTtlMs: number;
  sessionSweepIntervalMs: number;
  /** Pause between the end of a betting round and the next street. */
  streetDelayMs: number;
  /** Pause before each street of an all-in run-out (R-5.8), so the cards come out one by one. */
  runOutDelayMs: number;
  /** Results pause after a showdown, before the next hand is dealt. */
  showdownPauseMs: number;
  /** Results pause after a hand won by everyone else folding. */
  foldWinPauseMs: number;
}

export const DEFAULT_TIMINGS: Timings = {
  lobbyDisconnectGraceMs: 60_000,
  emptyRoomTtlMs: 10 * 60_000,
  sessionTtlMs: 24 * 60 * 60_000,
  sessionSweepIntervalMs: 10 * 60_000,
  streetDelayMs: 800,
  runOutDelayMs: 1500,
  showdownPauseMs: 5000,
  foldWinPauseMs: 3000,
};

/** R-9.3: a player still disconnected when this many hands in a row have started is removed between hands. */
export const MAX_MISSED_HANDS = 3;

export interface RateLimit {
  count: number;
  windowMs: number;
}

export interface RateLimits {
  /** All socket events, per socket. */
  socketEvents: RateLimit;
  /** room:join attempts, per player (slows down room-code guessing). */
  roomJoins: RateLimit;
  /** POST /api/session, per IP. */
  sessionCreates: RateLimit;
  /** Consecutive rate-limited events after which the socket is disconnected. */
  maxStrikes: number;
}

export const DEFAULT_RATE_LIMITS: RateLimits = {
  socketEvents: { count: 20, windowMs: 5_000 },
  roomJoins: { count: 10, windowMs: 60_000 },
  sessionCreates: { count: 10, windowMs: 60_000 },
  maxStrikes: 50,
};
