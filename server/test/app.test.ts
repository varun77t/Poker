import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAppServer } from '../src/app';
import { loadConfig } from '../src/config';
import { silentLogger } from '../src/logger';
import { startTestServer, type TestServer } from './helpers/testServer';

describe('HTTP', () => {
  let t: TestServer;

  beforeAll(async () => {
    t = await startTestServer();
  });
  afterAll(() => t.close());

  it('GET /health returns ok with counts', async () => {
    const res = await fetch(`${t.baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, sockets: 0, rooms: 0 });
  });

  it('unknown routes return a JSON 404', async () => {
    for (const url of ['/api/nope', '/nope']) {
      const res = await fetch(`${t.baseUrl}${url}`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ ok: false, error: 'NOT_FOUND' });
    }
  });

  it('malformed JSON is a 400, not a 500', async () => {
    const res = await fetch(`${t.baseUrl}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"displayName":',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: 'INVALID_PAYLOAD' });
  });
});

describe('client static serving (production mode)', () => {
  let t: TestServer;
  let distDir: string;

  beforeAll(async () => {
    distDir = mkdtempSync(path.join(os.tmpdir(), 'poker-dist-'));
    mkdirSync(path.join(distDir, 'assets'));
    writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><title>app</title>');
    writeFileSync(path.join(distDir, 'assets', 'app-abc123.js'), 'console.log(1)');
    t = await startTestServer({ clientDistDir: distDir });
  });
  afterAll(async () => {
    await t.close();
    rmSync(distDir, { recursive: true, force: true });
  });

  it('serves index.html for client routes', async () => {
    const res = await fetch(`${t.baseUrl}/room/ABC234`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>app</title>');
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });

  it('serves hashed assets with long-lived caching', async () => {
    const res = await fetch(`${t.baseUrl}/assets/app-abc123.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('immutable');
  });

  it('still returns JSON 404 for unknown API routes and serves /health', async () => {
    expect((await fetch(`${t.baseUrl}/api/nope`)).status).toBe(404);
    expect((await fetch(`${t.baseUrl}/health`)).status).toBe(200);
  });

  it('refuses to start without a client build', () => {
    expect(() =>
      createAppServer({ config: loadConfig({}), logger: silentLogger, clientDistDir: path.join(distDir, 'missing') }),
    ).toThrow(/Client build not found/);
  });
});
