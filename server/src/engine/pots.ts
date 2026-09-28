import type { PotView } from '@poker/shared';
import { clockwiseFrom } from './seats';

export interface PotInput {
  seat: number;
  contributed: number;
  folded: boolean;
}

export interface BuiltPots {
  /** Main pot first, then side pots. */
  pots: PotView[];
  /** Chips nobody matched (R-6.2); they go back to that player. */
  uncalled: { seat: number; amount: number } | null;
  /** Layers with contributors but no eligible player (R-6.4). Only possible after a forced fold. */
  anomalies: number;
  /**
   * Chips with no eligible player in any pot: every contributor folded (after forced folds). The
   * last player standing takes them (see endByFolds). Always 0 at a showdown.
   */
  unclaimed: number;
}

const sameSeats = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((seat, i) => seat === b[i]);

/** Main and side pots from whole-hand contributions (R-6.1 – R-6.4). */
export function buildPots(players: readonly PotInput[]): BuiltPots {
  const levels = [...new Set(players.map((p) => p.contributed).filter((c) => c > 0))].sort((a, b) => a - b);
  const pots: PotView[] = [];
  let uncalledSeat = -1;
  let uncalledAmount = 0;
  let anomalies = 0;
  let carry = 0;
  let previous = 0;

  for (const level of levels) {
    const contributors = players.filter((p) => p.contributed >= level);
    const amount = (level - previous) * contributors.length;
    previous = level;

    if (contributors.length === 1) {
      // R-6.2: only the top layers can have a single contributor, and it is always the same player.
      uncalledSeat = (contributors[0] as PotInput).seat;
      uncalledAmount += amount;
      continue;
    }

    const eligibleSeats = contributors
      .filter((p) => !p.folded)
      .map((p) => p.seat)
      .sort((a, b) => a - b);
    if (eligibleSeats.length === 0) {
      // R-6.4: should be impossible. Merge into the next lower pot (or the next higher one if none).
      anomalies++;
      const lower = pots.at(-1);
      if (lower) lower.amount += amount;
      else carry += amount;
      continue;
    }

    const last = pots.at(-1);
    if (last && sameSeats(last.eligibleSeats, eligibleSeats)) last.amount += amount + carry; // R-6.3
    else pots.push({ amount: amount + carry, eligibleSeats });
    carry = 0;
  }

  // `carry` is only left over when no layer had an eligible player at all.
  const uncalled = uncalledAmount > 0 ? { seat: uncalledSeat, amount: uncalledAmount } : null;
  return { pots, uncalled, anomalies, unclaimed: carry };
}

/**
 * R-7.2: split `amount` equally between `winnerSeats`; leftover chips go one at a time to the
 * winners in clockwise order starting from the first seat after the button.
 */
export function splitPot(amount: number, winnerSeats: readonly number[], buttonSeat: number): { seat: number; amount: number }[] {
  const ordered = clockwiseFrom(buttonSeat, winnerSeats);
  const share = Math.floor(amount / ordered.length);
  const remainder = amount - share * ordered.length;
  return ordered.map((seat, i) => ({ seat, amount: share + (i < remainder ? 1 : 0) }));
}
