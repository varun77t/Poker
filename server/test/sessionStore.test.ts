import { describe, expect, it } from 'vitest';
import { SessionStore } from '../src/sessions/sessionStore';
import { FakeClock } from './helpers/fakeClock';

const TTL = 60_000;

describe('SessionStore', () => {
  it('creates sessions with unique ids and unguessable tokens', () => {
    const store = new SessionStore(new FakeClock(), TTL);
    const a = store.create('Ada');
    const b = store.create('Ada');
    expect(a.playerId).not.toBe(b.playerId);
    expect(a.token).not.toBe(b.token);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes, base64url
  });

  it('resolves only valid tokens', () => {
    const store = new SessionStore(new FakeClock(), TTL);
    const s = store.create('Ada');
    expect(store.resolve(s.token)?.playerId).toBe(s.playerId);
    for (const bad of [undefined, null, 42, {}, '', 'nope', s.token + 'x', 'x'.repeat(500)]) {
      expect(store.resolve(bad)).toBeNull();
    }
  });

  it('expires idle sessions, and resolving refreshes the idle timer', () => {
    const clock = new FakeClock();
    const store = new SessionStore(clock, TTL);
    const s = store.create('Ada');
    clock.advance(TTL - 1);
    expect(store.resolve(s.token)).not.toBeNull(); // refreshes
    clock.advance(TTL);
    expect(store.resolve(s.token)).not.toBeNull();
    clock.advance(TTL + 1);
    expect(store.resolve(s.token)).toBeNull();
    expect(store.get(s.playerId)).toBeUndefined();
  });

  it('sweeps expired sessions but keeps active ones', () => {
    const clock = new FakeClock();
    const store = new SessionStore(clock, TTL);
    const idle = store.create('Idle');
    const active = store.create('Active');
    clock.advance(TTL + 1);
    expect(store.sweep((id) => id === active.playerId)).toEqual([idle.playerId]);
    expect(store.size).toBe(1);
    expect(store.resolve(active.token)).not.toBeNull();
  });

  it('renames in place', () => {
    const store = new SessionStore(new FakeClock(), TTL);
    const s = store.create('Ada');
    store.rename(s.playerId, 'Grace');
    expect(store.get(s.playerId)?.displayName).toBe('Grace');
  });
});
