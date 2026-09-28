import { RANKS, SUITS, type Card } from '@poker/shared';

/** Returns an integer in [0, maxExclusive). Production passes a `crypto.randomInt` wrapper. */
export type RandomInt = (maxExclusive: number) => number;

/** The 52 cards in a fixed order (2c, 2d, 2h, 2s, 3c, … As). */
export const FULL_DECK: readonly Card[] = RANKS.flatMap((rank) => SUITS.map((suit): Card => `${rank}${suit}`));

const CARD_SET = new Set<string>(FULL_DECK);

export function isCard(value: unknown): value is Card {
  return typeof value === 'string' && CARD_SET.has(value);
}

/** Fisher–Yates shuffle into a new array. Uniform as long as `randomInt` is. */
export function shuffle<T>(items: readonly T[], randomInt: RandomInt): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) throw new Error(`randomInt(${i + 1}) returned ${j}`);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

export function shuffledDeck(randomInt: RandomInt): Card[] {
  return shuffle(FULL_DECK, randomInt);
}
