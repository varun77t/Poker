import type { SessionInfo, TableSnapshot } from '@poker/shared';
import { useSyncExternalStore } from 'react';

export type ConnectionStatus =
  /** No session yet, so no socket. */
  | 'idle'
  | 'connecting'
  | 'connected'
  /** Lost the connection; Socket.IO is retrying. */
  | 'reconnecting'
  /** Another tab took over this session. */
  | 'replaced';

export interface AppState {
  session: SessionInfo | null;
  connection: ConnectionStatus;
  /** Latest server snapshot of the room this player is seated in; null when not in a room. */
  snapshot: TableSnapshot | null;
}

let state: AppState = { session: null, connection: 'idle', snapshot: null };
const listeners = new Set<() => void>();

export function getState(): AppState {
  return state;
}

export function setState(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Subscribes a component to part of the app state. The selector must return a stable value
 * (a primitive or an existing object from the state), not a freshly built object.
 */
export function useAppState<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

/** Accepts a snapshot only if it is newer than the one held for the same room. */
export function acceptSnapshot(incoming: TableSnapshot): void {
  const current = state.snapshot;
  if (current && current.room.code === incoming.room.code && incoming.version <= current.version) return;
  setState({ snapshot: incoming });
}
