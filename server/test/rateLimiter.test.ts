import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/rateLimiter';
import { FakeClock } from './helpers/fakeClock';

describe('RateLimiter', () => {
  it('allows a burst up to the limit, then refills over the window', () => {
    const clock = new FakeClock();
    const limiter = new RateLimiter(clock, 5, 1000);
    for (let i = 0; i < 5; i++) expect(limiter.take('k')).toBe(true);
    expect(limiter.take('k')).toBe(false);

    clock.advance(200); // one token
    expect(limiter.take('k')).toBe(true);
    expect(limiter.take('k')).toBe(false);

    clock.advance(10_000);
    for (let i = 0; i < 5; i++) expect(limiter.take('k')).toBe(true);
    expect(limiter.take('k')).toBe(false);
  });

  it('tracks keys independently', () => {
    const limiter = new RateLimiter(new FakeClock(), 1, 1000);
    expect(limiter.take('a')).toBe(true);
    expect(limiter.take('b')).toBe(true);
    expect(limiter.take('a')).toBe(false);
  });

  it('sweeps only fully refilled buckets', () => {
    const clock = new FakeClock();
    const limiter = new RateLimiter(clock, 2, 1000);
    limiter.take('a');
    limiter.take('a');
    limiter.sweep();
    expect(limiter.take('a')).toBe(false); // still limited: bucket kept
    clock.advance(1000);
    limiter.sweep(); // refilled → dropped; a fresh bucket starts full
    expect(limiter.take('a')).toBe(true);
    expect(limiter.take('a')).toBe(true);
  });
});
