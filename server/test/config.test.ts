import { describe, expect, it } from 'vitest';
import { listenPort, loadConfig } from '../src/config';

describe('loadConfig', () => {
  it('applies defaults', () => {
    expect(loadConfig({})).toEqual({ PORT: 3000, API_PORT: 3000, NODE_ENV: 'development', LOG_LEVEL: 'info' });
  });

  it('rejects invalid values', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});

describe('listenPort', () => {
  it('uses the public PORT in production', () => {
    expect(listenPort(loadConfig({ NODE_ENV: 'production', PORT: '8080', API_PORT: '3000' }))).toBe(8080);
  });

  it('ignores PORT in development, where Vite owns it', () => {
    // Tools often export PORT for the dev entry point; the API server must not grab it.
    expect(listenPort(loadConfig({ NODE_ENV: 'development', PORT: '5173' }))).toBe(3000);
    expect(listenPort(loadConfig({ NODE_ENV: 'development', PORT: '5173', API_PORT: '4000' }))).toBe(4000);
  });
});
