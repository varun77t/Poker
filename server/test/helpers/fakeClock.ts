import type { Cancel, Clock } from '../../src/clock';

interface Timer {
  id: number;
  at: number;
  fn: () => void;
}

/** Deterministic clock for tests: time only moves when `advance` is called. */
export class FakeClock implements Clock {
  private time = Date.UTC(2026, 0, 1);
  private timers: Timer[] = [];
  private nextId = 0;

  now(): number {
    return this.time;
  }

  schedule(delayMs: number, fn: () => void): Cancel {
    const id = ++this.nextId;
    this.timers.push({ id, at: this.time + delayMs, fn });
    return () => {
      this.timers = this.timers.filter((t) => t.id !== id);
    };
  }

  /** Moves time forward, running due timers in order (including ones they schedule). */
  advance(ms: number): void {
    const target = this.time + ms;
    for (;;) {
      const due = this.timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      this.timers = this.timers.filter((t) => t.id !== due.id);
      this.time = due.at;
      due.fn();
    }
    this.time = target;
  }

  get pendingTimers(): number {
    return this.timers.length;
  }
}
