import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config';
import { createLogger } from '../src/logger';
import { clientAddress } from '../src/socket/clientAddress';
import { request, startTestServer, type TestServer } from './helpers/testServer';

/** Phase 10: what the production server adds on top of the game (docs/deployment.md). */

let t: TestServer | undefined;
afterEach(async () => {
  await t?.close();
  t = undefined;
});

describe('secure headers', () => {
  it('sends a same-origin content security policy and the usual hardening headers', async () => {
    t = await startTestServer();
    const res = await fetch(`${t.baseUrl}/health`);
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('upgrade-insecure-requests');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('strict-transport-security')).toContain('max-age=');
    expect(res.headers.get('x-powered-by')).toBeNull();
  });
});

describe('behind a proxy', () => {
  it('reads the client address from X-Forwarded-For only for the trusted number of hops', () => {
    const handshake = (xff?: string) => ({ address: '10.0.0.1', headers: xff ? { 'x-forwarded-for': xff } : {} });
    expect(clientAddress(handshake('203.0.113.7'), 0)).toBe('10.0.0.1'); // no trusted proxy: ignore the header
    expect(clientAddress(handshake('203.0.113.7'), 1)).toBe('203.0.113.7');
    expect(clientAddress(handshake('6.6.6.6, 203.0.113.7'), 1)).toBe('203.0.113.7'); // a spoofed left entry is ignored
    expect(clientAddress(handshake('203.0.113.7, 10.1.1.1'), 2)).toBe('203.0.113.7');
    expect(clientAddress(handshake(), 1)).toBe('10.0.0.1');
  });

  it('limits new sessions per visitor, not per proxy, when TRUST_PROXY is set', async () => {
    t = await startTestServer({
      config: loadConfig({ NODE_ENV: 'test', TRUST_PROXY: '1' }),
      rateLimits: { sessionCreates: { count: 2, windowMs: 60_000 } },
    });
    const baseUrl = t.baseUrl;
    const create = (ip: string) =>
      fetch(`${baseUrl}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify({ displayName: 'Guest' }),
      }).then((r) => r.status);
    expect([await create('198.51.100.1'), await create('198.51.100.1'), await create('198.51.100.1')]).toEqual([201, 201, 429]);
    // A different visitor behind the same proxy is unaffected.
    expect(await create('198.51.100.2')).toBe(201);
  });

  it('limits room-code guesses per visitor across many guest sessions', async () => {
    t = await startTestServer({
      config: loadConfig({ NODE_ENV: 'test', TRUST_PROXY: '1' }),
      rateLimits: { roomJoinsPerIp: { count: 3, windowMs: 60_000 } },
    });
    const results: string[] = [];
    // Mallory makes a fresh guest session for every guess, all from one address.
    for (let i = 0; i < 4; i++) {
      const { body } = await t.createSession(`Mallory${i}`);
      if (!body.ok) throw new Error(body.message);
      const socket = t.connect(body.data.sessionToken, { 'x-forwarded-for': '203.0.113.9' });
      await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
      const res = await request(socket, 'room:join', { code: 'ABCDEF' });
      results.push(res.ok ? 'ok' : res.error);
    }
    expect(results).toEqual(['ROOM_NOT_FOUND', 'ROOM_NOT_FOUND', 'ROOM_NOT_FOUND', 'RATE_LIMITED']);
  });
});

describe('graceful shutdown', () => {
  it('tells every connected client before closing their sockets', async () => {
    const server = await startTestServer();
    const alice = await server.player('Alice');
    const notice = new Promise<void>((resolve) => alice.socket.once('sys:shutdown', () => resolve()));
    const closed = server.server.close({ notify: true });
    await notice;
    await closed;
    alice.socket.disconnect();
  });
});

describe('structured logging', () => {
  it('writes one JSON object per line in json format, with errors serialized', () => {
    const lines: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((line: string) => void lines.push(line));
    const err = vi.spyOn(console, 'error').mockImplementation((line: string) => void lines.push(line));
    const logger = createLogger('info', 'json');
    logger.info('listening', { port: 3000 });
    logger.error('boom', new Error('bad thing'));
    logger.debug('hidden');
    log.mockRestore();
    err.mockRestore();
    expect(lines).toHaveLength(2);
    const [info, error] = lines.map((l) => JSON.parse(l));
    expect(info).toMatchObject({ level: 'info', msg: 'listening', meta: { port: 3000 } });
    expect(error).toMatchObject({ level: 'error', msg: 'boom', meta: { name: 'Error', message: 'bad thing' } });
    expect(typeof error.meta.stack).toBe('string');
  });
});
