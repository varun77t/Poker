import { AUTH_INVALID, type ClientEventName, type EventAck, type EventPayload, type SessionInfo } from '@poker/shared';
import { postSession } from '../lib/api';
import { loadName, loadSession, saveSession } from '../lib/storage';
import { acceptSnapshot, getState, setState } from '../state/store';
import { notifyError } from '../state/toasts';
import { socket } from './socket';

const REQUEST_TIMEOUT_MS = 8000;

/** Emits a client→server event and resolves with its ack; timeouts become an error ack. */
export async function request<E extends ClientEventName>(event: E, payload: EventPayload<E>): Promise<EventAck<E>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic bridge over Socket.IO's typed emit
    return await (socket.timeout(REQUEST_TIMEOUT_MS) as any).emitWithAck(event, payload);
  } catch {
    return { ok: false, error: 'INTERNAL', message: 'The server did not respond. Check your connection.' } as EventAck<E>;
  }
}

/** Points the socket at `session` and connects (reconnecting if it was using another token). */
export function connectAs(session: SessionInfo): void {
  const currentToken = (socket.auth as { token?: string } | undefined)?.token;
  if (currentToken !== session.sessionToken && (socket.connected || socket.active)) socket.disconnect();
  socket.auth = { token: session.sessionToken };
  if (!socket.connected) {
    setState({ connection: 'connecting' });
    socket.connect();
  }
}

/** Reconnects in this tab after another tab took the session over. */
export function takeOverSession(): void {
  const session = getState().session;
  if (session) connectAs(session);
}

let recovering = false;

/**
 * The server no longer knows our token (it restarted, or the session expired). Get a fresh session
 * under the same name and reconnect; the old seat is gone either way.
 */
async function recoverSession(): Promise<void> {
  if (recovering) return;
  recovering = true;
  try {
    saveSession(null);
    setState({ session: null, snapshot: null, connection: 'idle' });
    const name = loadName();
    if (!name) return;
    const res = await postSession(name);
    if (!res.ok) return;
    saveSession(res.data);
    setState({ session: res.data });
    connectAs(res.data);
  } finally {
    recovering = false;
  }
}

let initialized = false;

/** Wires socket events into the app store and connects if a saved session exists. Call once at startup. */
export function initConnection(): void {
  if (initialized) return;
  initialized = true;

  socket.on('connect', () => {
    setState({ connection: 'connected' });
    // The server re-sends our room's snapshot; if we lost our seat while away, drop the stale one.
    void request('sync:request', {}).then((res) => {
      if (res.ok && res.data.roomCode === null) setState({ snapshot: null });
    });
  });

  socket.on('disconnect', () => {
    if (getState().connection === 'replaced') return;
    setState({ connection: socket.active ? 'reconnecting' : 'idle' });
  });

  socket.on('connect_error', (err) => {
    if (err.message === AUTH_INVALID) void recoverSession();
    else setState({ connection: 'reconnecting' });
  });

  socket.on('state', acceptSnapshot);

  socket.on('session:replaced', () => setState({ connection: 'replaced' }));

  // A deploy or restart: games live in the server's memory, so any game in progress is over.
  socket.on('sys:shutdown', () => notifyError('The server is restarting, so games in progress have ended. You can start a new room once it is back.'));

  const saved = loadSession();
  if (saved) {
    setState({ session: saved });
    connectAs(saved);
  }
}
