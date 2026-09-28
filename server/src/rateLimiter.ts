import type { Clock } from './clock';

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/** Token bucket per key: `count` requests per `windowMs`, refilled continuously, bursts up to `count`. */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly refillPerMs: number;

  constructor(
    private readonly clock: Clock,
    private readonly count: number,
    windowMs: number,
  ) {
    this.refillPerMs = count / windowMs;
  }

  /** Consumes one token for `key`. Returns false if the key is over its limit. */
  take(key: string): boolean {
    const bucket = this.refill(key);
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  delete(key: string): void {
    this.buckets.delete(key);
  }

  /** Drops buckets that have fully refilled, so idle keys don't accumulate. */
  sweep(): void {
    for (const key of [...this.buckets.keys()]) {
      if (this.refill(key).tokens >= this.count) this.buckets.delete(key);
    }
  }

  private refill(key: string): Bucket {
    const now = this.clock.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.count, updatedAt: now };
      this.buckets.set(key, bucket);
      return bucket;
    }
    bucket.tokens = Math.min(this.count, bucket.tokens + (now - bucket.updatedAt) * this.refillPerMs);
    bucket.updatedAt = now;
    return bucket;
  }
}
