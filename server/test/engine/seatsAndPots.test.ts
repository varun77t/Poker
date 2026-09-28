import { describe, expect, it } from 'vitest';
import { buildPots, firstButtonSeat, nextButtonSeat, splitPot } from '../../src/engine';

describe('button rotation (R-2.2)', () => {
  it('moves one eligible seat clockwise each hand and wraps', () => {
    const seats = [0, 1, 2, 3, 4];
    const buttons = [0];
    for (let i = 0; i < 6; i++) buttons.push(nextButtonSeat(buttons.at(-1) as number, seats));
    expect(buttons).toEqual([0, 1, 2, 3, 4, 0, 1]);
  });

  it('skips a busted seat', () => {
    // Seat 1 busted last hand; the button moves from 0 straight to 2.
    expect(nextButtonSeat(0, [0, 2, 3])).toBe(2);
  });

  it('moves on from a seat that is now empty (the previous button left)', () => {
    expect(nextButtonSeat(2, [0, 3, 4])).toBe(3);
    expect(nextButtonSeat(4, [1, 2])).toBe(1);
  });

  it('picks the first button with the injected RNG', () => {
    expect(firstButtonSeat([1, 3, 4], () => 2)).toBe(4);
    expect(firstButtonSeat([1, 3, 4], () => 0)).toBe(1);
  });

  it('needs at least one eligible seat', () => {
    expect(() => nextButtonSeat(0, [])).toThrow();
    expect(() => firstButtonSeat([], () => 0)).toThrow();
  });
});

const inputs = (rows: [seat: number, contributed: number, folded?: boolean][]) =>
  rows.map(([seat, contributed, folded = false]) => ({ seat, contributed, folded }));

describe('buildPots (R-6.1 – R-6.4)', () => {
  it('makes a single pot when everyone put in the same', () => {
    expect(buildPots(inputs([[0, 100], [1, 100], [2, 100]]))).toEqual({
      pots: [{ amount: 300, eligibleSeats: [0, 1, 2] }],
      uncalled: null,
      anomalies: 0,
      unclaimed: 0,
    });
  });

  it('returns chips nobody matched, even to a player who folded (R-6.2)', () => {
    expect(buildPots(inputs([[0, 100], [1, 300]])).uncalled).toEqual({ seat: 1, amount: 200 });
    expect(buildPots(inputs([[0, 100, true], [1, 40]])).uncalled).toEqual({ seat: 0, amount: 60 });
  });

  it('builds a main pot and two side pots from four different contributions', () => {
    const { pots, uncalled } = buildPots(inputs([[0, 100], [1, 250], [2, 400], [3, 400]]));
    expect(pots).toEqual([
      { amount: 400, eligibleSeats: [0, 1, 2, 3] },
      { amount: 450, eligibleSeats: [1, 2, 3] },
      { amount: 300, eligibleSeats: [2, 3] },
    ]);
    expect(uncalled).toBeNull();
  });

  it("puts a folded player's chips in the pots without making them eligible, merging equal pots (R-6.3)", () => {
    const { pots } = buildPots(inputs([[0, 100], [1, 150, true], [2, 300], [3, 300]]));
    expect(pots).toEqual([
      { amount: 400, eligibleSeats: [0, 2, 3] },
      { amount: 450, eligibleSeats: [2, 3] }, // 50×3 + 150×2 in one pot: same eligible players
    ]);
  });

  it('merges chips nobody is eligible for into the pot below and reports it (R-6.4)', () => {
    // Only reachable after a forced fold: both players above the all-in level have folded.
    const { pots, anomalies } = buildPots(inputs([[0, 50], [1, 100, true], [2, 100, true]]));
    expect(pots).toEqual([{ amount: 250, eligibleSeats: [0] }]);
    expect(anomalies).toBe(1);
  });

  it('reports chips that no pot has an eligible player for', () => {
    // Both blinds folded (left the table) before the button put anything in.
    expect(buildPots(inputs([[0, 0], [1, 5, true], [2, 10, true]]))).toEqual({
      pots: [],
      uncalled: { seat: 2, amount: 5 },
      anomalies: 1,
      unclaimed: 10,
    });
  });

  it('ignores players who put nothing in', () => {
    expect(buildPots(inputs([[0, 0, true], [1, 10], [2, 10]])).pots).toEqual([{ amount: 20, eligibleSeats: [1, 2] }]);
  });
});

describe('splitPot (R-7.2)', () => {
  it('splits evenly', () => {
    expect(splitPot(100, [1, 3], 0)).toEqual([
      { seat: 1, amount: 50 },
      { seat: 3, amount: 50 },
    ]);
  });

  it('gives odd chips one at a time clockwise from the seat after the button', () => {
    // Button on 3: clockwise order is 4, 0, 1, 2, 3.
    expect(splitPot(101, [0, 4], 3)).toEqual([
      { seat: 4, amount: 51 },
      { seat: 0, amount: 50 },
    ]);
    expect(splitPot(101, [1, 2, 3], 3)).toEqual([
      { seat: 1, amount: 34 },
      { seat: 2, amount: 34 },
      { seat: 3, amount: 33 }, // the button is last
    ]);
  });
});
