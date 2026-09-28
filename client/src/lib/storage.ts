import type { SessionInfo } from '@poker/shared';

/**
 * Browser persistence for the guest session. localStorage is shared by all tabs, so a second tab is
 * the same player (and takes over the connection).
 *
 * Development only: open a tab with `?player=2` (any short id) to give that tab its own separate
 * identity, so several players can be tested in one browser. The slot sticks to the tab via
 * sessionStorage.
 */

function devSlot(): string | null {
  if (!import.meta.env.DEV) return null;
  try {
    const param = new URLSearchParams(window.location.search).get('player');
    if (param && /^[a-z0-9]{1,8}$/i.test(param)) window.sessionStorage.setItem('poker.devSlot', param);
    return window.sessionStorage.getItem('poker.devSlot');
  } catch {
    return null;
  }
}

const slot = devSlot();
const SESSION_KEY = slot ? `poker.session.${slot}` : 'poker.session';
const NAME_KEY = slot ? `poker.name.${slot}` : 'poker.name';

export const devPlayerSlot = slot;

function isSessionInfo(value: unknown): value is SessionInfo {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.playerId === 'string' && typeof v.sessionToken === 'string' && typeof v.displayName === 'string';
}

export function loadSession(): SessionInfo | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isSessionInfo(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(session: SessionInfo | null): void {
  try {
    if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage unavailable (private mode, blocked): the session just won't survive a reload.
  }
}

/** The last display name used, kept even when the session itself is lost. */
export function loadName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string): void {
  try {
    window.localStorage.setItem(NAME_KEY, name);
  } catch {
    // See saveSession.
  }
}
