import { describe, expect, it } from 'vitest';
import { FULL_DECK, shuffle, shuffledDeck } from '../../src/engine';
import { secureRandomInt } from '../../src/rooms/roomCode';

describe('deck', () => {
  it('has 52 distinct cards', () => {
    expect(FULL_DECK).toHaveLength(52);
    expect(new Set(FULL_DECK).size).toBe(52);
    expect(FULL_DECK.slice(0, 4)).toEqual(['2c', '2d', '2h', '2s']);
    expect(FULL_DECK.at(-1)).toBe('As');
  });

  it('shuffles into a new permutation without touching the input', () => {
    const input = Object.freeze([...FULL_DECK]);
    const out = shuffledDeck(secureRandomInt);
    expect(out).not.toBe(input);
    expect([...out].sort()).toEqual([...input].sort());
  });

  it('is an unbiased Fisher–Yates: every RNG path gives a different permutation', () => {
    // For 4 items the shuffle asks randomInt(4), randomInt(3), randomInt(2): 24 paths for 24 permutations.
    // Each permutation appearing exactly once means a uniform RNG yields a uniform shuffle.
    const seen = new Set<string>();
    for (let a = 0; a < 4; a++) {
      for (let b = 0; b < 3; b++) {
        for (let c = 0; c < 2; c++) {
          const answers = [a, b, c];
          const calls: number[] = [];
          const perm = shuffle(['w', 'x', 'y', 'z'], (max) => {
            calls.push(max);
            return answers.shift() as number;
          });
          expect(calls).toEqual([4, 3, 2]);
          seen.add(perm.join(''));
        }
      }
    }
    expect(seen.size).toBe(24);
  });

  it('rejects an RNG that returns out-of-range values', () => {
    expect(() => shuffle([1, 2, 3], () => 3)).toThrow();
    expect(() => shuffle([1, 2, 3], () => -1)).toThrow();
    expect(() => shuffle([1, 2, 3], () => 0.5)).toThrow();
  });
});
