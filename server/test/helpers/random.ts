import type { RandomInt } from '../../src/rooms/roomCode';

/** Deterministic RandomInt (mulberry32) for reproducible tests. */
export function seededRandomInt(seed: number): RandomInt {
  let a = seed >>> 0;
  return (maxExclusive) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const unit = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(unit * maxExclusive);
  };
}

/** A seeded RandomInt whose next results can be forced, e.g. to put the first button on a chosen seat. */
export function controlledRandomInt(seed: number): RandomInt & { force: (...values: number[]) => void } {
  const seeded = seededRandomInt(seed);
  const forced: number[] = [];
  const fn = (maxExclusive: number) => (forced.length > 0 ? (forced.shift() as number) % maxExclusive : seeded(maxExclusive));
  return Object.assign(fn, { force: (...values: number[]) => void forced.push(...values) });
}
