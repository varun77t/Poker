import { MAX_SEATS } from '@poker/shared';
import type { RandomInt } from './deck';

/**
 * Seat arithmetic. "Clockwise" / "left of" means the next higher seat index, wrapping
 * MAX_SEATS − 1 → 0 (game-rules §1).
 */

/** Steps clockwise from `from` to `to`, in 1..MAX_SEATS (a full circle when they are equal). */
export function stepsClockwise(from: number, to: number): number {
  return (to - from + MAX_SEATS) % MAX_SEATS || MAX_SEATS;
}

/** The first of `seats` strictly clockwise from `from`; `from` itself only if it is the only one. */
export function nextSeatClockwise(from: number, seats: readonly number[]): number | null {
  let best: number | null = null;
  for (const seat of seats) {
    if (best === null || stepsClockwise(from, seat) < stepsClockwise(from, best)) best = seat;
  }
  return best;
}

/** `seats` ordered clockwise starting from the first seat after `from` (`from` itself last). */
export function clockwiseFrom(from: number, seats: readonly number[]): number[] {
  return [...seats].sort((a, b) => stepsClockwise(from, a) - stepsClockwise(from, b));
}

/** R-2.2: the first hand's button is a uniformly random eligible seat. */
export function firstButtonSeat(eligibleSeats: readonly number[], randomInt: RandomInt): number {
  if (eligibleSeats.length === 0) throw new Error('No eligible seats for the button');
  return eligibleSeats[randomInt(eligibleSeats.length)] as number;
}

/**
 * R-2.2 (simplified "moving button"): the first eligible seat clockwise from the previous button.
 * The previous button seat may now be empty or busted.
 */
export function nextButtonSeat(previousButton: number, eligibleSeats: readonly number[]): number {
  const next = nextSeatClockwise(previousButton, eligibleSeats);
  if (next === null) throw new Error('No eligible seats for the button');
  return next;
}
