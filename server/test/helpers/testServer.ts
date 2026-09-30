import type { AddressInfo } from 'node:net';
import type {
  Ack,
  ClientEventName,
  ClientToServerEvents,
  EventAck,
  EventPayload,
  ServerToClientEvents,
  SessionInfo,
  TableSnapshot,
} from '@poker/shared';
import { io as ioClient, type Socket } from 'socket.io-client';
import { createAppServer, type AppServer, type AppServerOptions } from '../../src/app';
import { loadConfig } from '../../src/config';
import { silentLogger } from '../../src/logger';
import { FakeClock } from './fakeClock';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface TestPlayer {
  info: SessionInfo;
  socket: ClientSocket;
  /** Latest `state` snapshot received, if any. */
  latest: () => TableSnapshot | undefined;
  /** Every `state` snapshot this socket received, in order. */
  received: TableSnapshot[];
  /** Resolves with the latest snapshot matching `predicate`, waiting for new ones if needed. */
  stateWhere: (predicate: (s: TableSnapshot) => boolean, timeoutMs?: number) => Promise<TableSnapshot>;
}

export interface TestServer {
  server: AppServer;
  baseUrl: string;
  clock: FakeClock;
  createSession: (displayName: string, token?: string) => Promise<{ status: number; body: Ack<SessionInfo> }>;
  connect: (token: unknown, headers?: Record<string, string>) => ClientSocket;
  /** Creates a session and a connected socket. */
  player: (displayName: string) => Promise<TestPlayer>;
  /** A new connection with the same session (e.g. after a network drop). */
  reconnect: (player: TestPlayer) => Promise<TestPlayer>;
  close: () => Promise<void>;
}

export async function startTestServer(
  overrides: Partial<Omit<AppServerOptions, 'logger'>> = {},
): Promise<TestServer> {
  const clock = new FakeClock();
  const server = createAppServer({
    config: loadConfig({ NODE_ENV: 'test' }),
    logger: silentLogger,
    clientDistDir: null,
    clock,
    ...overrides,
  });
  await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = server.httpServer.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const sockets: ClientSocket[] = [];

  const createSession: TestServer['createSession'] = async (displayName, token) => {
    const res = await fetch(`${baseUrl}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ displayName }),
    });
    return { status: res.status, body: (await res.json()) as Ack<SessionInfo> };
  };

  const connect: TestServer['connect'] = (token, headers) => {
    const socket: ClientSocket = ioClient(baseUrl, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      auth: { token },
      ...(headers ? { extraHeaders: headers } : {}),
    });
    sockets.push(socket);
    return socket;
  };

  const attach = async (info: SessionInfo): Promise<TestPlayer> => {
    const socket = connect(info.sessionToken);
    let latest: TableSnapshot | undefined;
    const received: TableSnapshot[] = [];
    const waiters = new Set<(s: TableSnapshot) => void>();
    socket.on('state', (s) => {
      latest = s;
      received.push(s);
      for (const w of [...waiters]) w(s);
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });

    const stateWhere: TestPlayer['stateWhere'] = (predicate, timeoutMs = 2000) =>
      new Promise((resolve, reject) => {
        if (latest && predicate(latest)) return resolve(latest);
        const timer = setTimeout(() => {
          waiters.delete(check);
          reject(new Error(`No matching state within ${timeoutMs}ms. Latest: ${JSON.stringify(latest)}`));
        }, timeoutMs);
        const check = (s: TableSnapshot) => {
          if (!predicate(s)) return;
          clearTimeout(timer);
          waiters.delete(check);
          resolve(s);
        };
        waiters.add(check);
      });

    return { info, socket, latest: () => latest, received, stateWhere };
  };

  const player: TestServer['player'] = async (displayName) => {
    const { body } = await createSession(displayName);
    if (!body.ok) throw new Error(`session failed: ${body.message}`);
    return attach(body.data);
  };

  const reconnect: TestServer['reconnect'] = (previous) => attach(previous.info);

  const close = async () => {
    for (const s of sockets) s.disconnect();
    await server.close();
  };

  return { server, baseUrl, clock, createSession, connect, player, reconnect, close };
}

/** Emits with an ack and a timeout, for tests. */
export function request<E extends ClientEventName>(
  socket: ClientSocket,
  event: E,
  payload: EventPayload<E>,
): Promise<EventAck<E>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic bridge over Socket.IO's typed emit
  return (socket.timeout(2000) as any).emitWithAck(event, payload);
}

/** Resolves once the socket disconnects. */
export function disconnected(socket: ClientSocket): Promise<string> {
  return new Promise((resolve) => socket.once('disconnect', resolve));
}
