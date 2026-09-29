/** A uniform number in [0, 1). */
export type Rng = () => number;

/**
 * mulberry32: a small, fast, seedable generator for bot choices and bot Monte Carlo runs only. Real
 * cards never come from it (shuffles stay on crypto.randomInt). The table seeds a fresh one for each
 * decision from its secure RandomInt, so bots are unpredictable in play and repeatable in tests.
 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
