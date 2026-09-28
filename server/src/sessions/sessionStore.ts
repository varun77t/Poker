import { randomBytes, randomUUID } from 'node:crypto';
import type { PlayerId, SessionInfo } from '@poker/shared';
import type { Clock } from '../clock';

export interface Session {
  playerId: PlayerId;
  token: string;
  displayName: string;
  lastSeenAt: number;
}

const MAX_TOKEN_LENGTH = 128;

/**
 * In-memory guest sessions: a secret token maps to a stable playerId. The token is the only
 * credential; it is never logged or sent to other players. See docs/architecture.md §5.
 */
export class SessionStore {
  private readonly byToken = new Map<string, Session>();
  private readonly byPlayer = new Map<PlayerId, Session>();

  constructor(
    private readonly clock: Clock,
    private readonly ttlMs: number,
  ) {}

  get size(): number {
    return this.byPlayer.size;
  }

  create(displayName: string): Session {
    const session: Session = {
      playerId: randomUUID(),
      token: randomBytes(32).toString('base64url'),
      displayName,
      lastSeenAt: this.clock.now(),
    };
    this.byToken.set(session.token, session);
    this.byPlayer.set(session.playerId, session);
    return session;
  }

  /** Returns the live session for an untrusted token value, refreshing its idle timer. */
  resolve(token: unknown): Session | null {
    if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;
    const session = this.byToken.get(token);
    if (!session) return null;
    if (this.isExpired(session)) {
      this.remove(session);
      return null;
    }
    session.lastSeenAt = this.clock.now();
    return session;
  }

  get(playerId: PlayerId): Session | undefined {
    return this.byPlayer.get(playerId);
  }

  touch(playerId: PlayerId): void {
    const session = this.byPlayer.get(playerId);
    if (session) session.lastSeenAt = this.clock.now();
  }

  rename(playerId: PlayerId, displayName: string): void {
    const session = this.byPlayer.get(playerId);
    if (session) session.displayName = displayName;
  }

  /** Removes expired sessions, skipping players with a live connection. Returns the removed ids. */
  sweep(isActive: (playerId: PlayerId) => boolean): PlayerId[] {
    const expired: PlayerId[] = [];
    for (const session of [...this.byPlayer.values()]) {
      if (isActive(session.playerId)) {
        session.lastSeenAt = this.clock.now();
      } else if (this.isExpired(session)) {
        this.remove(session);
        expired.push(session.playerId);
      }
    }
    return expired;
  }

  private isExpired(session: Session): boolean {
    return this.clock.now() - session.lastSeenAt > this.ttlMs;
  }

  private remove(session: Session): void {
    this.byToken.delete(session.token);
    this.byPlayer.delete(session.playerId);
  }
}

export function toSessionInfo(session: Session): SessionInfo {
  return { playerId: session.playerId, sessionToken: session.token, displayName: session.displayName };
}
