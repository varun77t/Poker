import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { ClientToServerEvents, ServerToClientEvents } from '@poker/shared';
import { io as ioClient, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createAppServer, type AppServer } from '../src/app';
import { loadConfig } from '../src/config';
import { silentLogger } from '../src/logger';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

async function startServer(clientDistDir: string | null = null): Promise<{ server: AppServer; baseUrl: string }> {
  const server = createAppServer({
    config: loadConfig({ NODE_ENV: 'test' }),
    logger: silentLogger,
    clientDistDir,
  });
  await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = server.httpServer.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

function stopServer(server: AppServer): Promise<void> {
  return new Promise((resolve) => void server.io.close(() => resolve()));
}

describe('HTTP', () => {
  let server: AppServer;
  let baseUrl: string;

  beforeAll(async () => ({ server, baseUrl } = await startServer()));
  afterAll(() => stopServer(server));

  it('GET /health returns ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; sockets: number };
    expect(body.ok).toBe(true);
    expect(typeof body.sockets).toBe('number');
  });

  it('unknown routes return a JSON 404', async () => {
    for (const url of ['/api/nope', '/nope']) {
      const res = await fetch(`${baseUrl}${url}`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ ok: false, error: 'NOT_FOUND' });
    }
  });
});

describe('Socket.IO', () => {
  let server: AppServer;
  let baseUrl: string;
  const sockets: ClientSocket[] = [];

  function connect(): ClientSocket {
    const socket: ClientSocket = ioClient(baseUrl, { transports: ['websocket'], forceNew: true, reconnection: false });
    sockets.push(socket);
    return socket;
  }

  beforeAll(async () => ({ server, baseUrl } = await startServer()));
  afterEach(() => sockets.splice(0).forEach((s) => s.disconnect()));
  afterAll(() => stopServer(server));

  it('connects and receives sys:hello', async () => {
    const socket = connect();
    const hello = await new Promise<{ serverTime: number }>((resolve) => socket.once('sys:hello', resolve));
    expect(hello.serverTime).toBeGreaterThan(0);
  });

  it('answers sys:ping through an ack', async () => {
    const socket = connect();
    const res = await socket.timeout(2000).emitWithAck('sys:ping', {});
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.serverTime).toBeGreaterThan(0);
  });

  it('rejects a ping payload with unknown keys', async () => {
    const socket = connect();
    // Simulates a malicious client sending fields outside the contract.
    const res = await socket.timeout(2000).emitWithAck('sys:ping', { playerId: 'spoof' } as never);
    expect(res).toMatchObject({ ok: false, error: 'INVALID_PAYLOAD' });
  });
});

describe('client static serving (production mode)', () => {
  let server: AppServer;
  let baseUrl: string;
  let distDir: string;

  beforeAll(async () => {
    distDir = mkdtempSync(path.join(os.tmpdir(), 'poker-dist-'));
    mkdirSync(path.join(distDir, 'assets'));
    writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><title>app</title>');
    writeFileSync(path.join(distDir, 'assets', 'app-abc123.js'), 'console.log(1)');
    ({ server, baseUrl } = await startServer(distDir));
  });
  afterAll(async () => {
    await stopServer(server);
    rmSync(distDir, { recursive: true, force: true });
  });

  it('serves index.html for client routes', async () => {
    const res = await fetch(`${baseUrl}/room/ABC234`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>app</title>');
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });

  it('serves hashed assets with long-lived caching', async () => {
    const res = await fetch(`${baseUrl}/assets/app-abc123.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('immutable');
  });

  it('still returns JSON 404 for unknown API routes and serves /health', async () => {
    expect((await fetch(`${baseUrl}/api/nope`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/health`)).status).toBe(200);
  });

  it('refuses to start without a client build', () => {
    expect(() =>
      createAppServer({ config: loadConfig({}), logger: silentLogger, clientDistDir: path.join(distDir, 'missing') }),
    ).toThrow(/Client build not found/);
  });
});
