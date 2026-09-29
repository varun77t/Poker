import { describe, expect, it } from 'vitest';
import { game, player } from './fixtures';
import { TIMING, planMotion, type MotionStep } from './motionPlan';

const kinds = (steps: MotionStep[]) => steps.map((s) => `${s.kind}:${'to' in s ? s.to : s.target}`);

describe('planMotion', () => {
  it('deals a fresh hand one card at a time from left of the button, blinds first', () => {
    // Button 0, so the deal starts at seat 1. Ana (seat 0) is the viewer: her second card turns over.
    const g = game({ seq: 0, players: [player(0), player(1, { committed: 5 }), player(2, { committed: 10 })] });
    const steps = planMotion(null, g, 'ana');
    expect(kinds(steps)).toEqual([
      'chips:bet-1',
      'chips:bet-2',
      'deal:hole-1-0',
      'deal:hole-2-0',
      'deal:hole-0-0',
      'deal:hole-1-1',
      'deal:hole-2-1',
      'deal:hole-0-1',
    ]);
    expect(steps.filter((s) => s.kind === 'deal' && s.flip).map((s) => ('to' in s ? s.to : ''))).toEqual(['hole-0-1']);
    const delays = steps.filter((s) => s.kind === 'deal').map((s) => s.delay);
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
  });

  it('animates nothing when joining or reconnecting in the middle of a hand', () => {
    expect(planMotion(null, game({ seq: 7 }), 'ana')).toEqual([]);
    expect(planMotion(game({ handId: 3 }), game({ handId: 4, seq: 2 }), 'ana')).toEqual([]);
  });

  it('moves chips from a player to their bet when they bet, call or raise', () => {
    const prev = game({ players: [player(0), player(1, { committed: 5 }), player(2, { committed: 10 })] });
    const next = game({ players: [player(0, { committed: 40, stack: 960 }), player(1, { committed: 5 }), player(2, { committed: 10 })] });
    expect(planMotion(prev, next, 'ana')).toEqual([{ kind: 'chips', from: 'plaque-0', to: 'bet-0', amount: 40, delay: 0 }]);
  });

  it('when a call closes the round, shows the call and then sweeps every bet into the pot', () => {
    const prev = game({ toActSeat: 2, players: [player(0, { committed: 40 }), player(1, { status: 'folded', committed: 5 }), player(2, { committed: 10 })] });
    const next = game({
      pots: [{ amount: 85, eligibleSeats: [0, 2] }],
      players: [player(0), player(1, { status: 'folded' }), player(2, { stack: 970, lastAction: { type: 'call', amount: 40, allIn: false } })],
    });
    expect(planMotion(prev, next, 'ana')).toEqual([
      { kind: 'chips', from: 'plaque-2', to: 'bet-2', amount: 40, delay: 0 },
      { kind: 'chips', from: 'bet-2', to: 'pot', amount: 40, delay: TIMING.sweepDelay },
      { kind: 'chips', from: 'bet-0', to: 'pot', amount: 40, delay: TIMING.sweepDelay, fromPrevious: true },
      { kind: 'chips', from: 'bet-1', to: 'pot', amount: 5, delay: TIMING.sweepDelay, fromPrevious: true },
    ]);
  });

  it('when a check closes the round, just sweeps', () => {
    const prev = game({ toActSeat: 2, players: [player(0, { committed: 10 }), player(2, { committed: 10 })] });
    const next = game({ players: [player(0), player(2, { lastAction: { type: 'check', allIn: false } })] });
    expect(kinds(planMotion(prev, next, 'ana'))).toEqual(['chips:pot', 'chips:pot']);
  });

  it('deals new board cards one after another', () => {
    const prev = game({ street: 'preflop' });
    const next = game({ street: 'flop', board: ['7h', 'Kd', '2c'] });
    expect(planMotion(prev, next, 'ana')).toEqual([
      { kind: 'board', to: 'board-0', delay: 0 },
      { kind: 'board', to: 'board-1', delay: TIMING.boardStagger },
      { kind: 'board', to: 'board-2', delay: TIMING.boardStagger * 2 },
    ]);
  });

  it("turns over other players' cards when they are revealed, never the viewer's own", () => {
    const prev = game({ players: [player(0, { holeCards: ['Ks', 'Kh'] }), player(1)] });
    const next = game({ players: [player(0, { holeCards: ['Ks', 'Kh'] }), player(1, { holeCards: ['9c', '9d'] })] });
    expect(kinds(planMotion(prev, next, 'ana'))).toEqual(['reveal:hole-1-0', 'reveal:hole-1-1']);
  });

  it('pays the pot out to the winners when the hand ends', () => {
    const prev = game({ toActSeat: 1, players: [player(0, { committed: 60 }), player(1)] });
    const next = game({
      players: [player(0, { committed: 60, stack: 1090 }), player(1, { status: 'folded', lastAction: { type: 'fold', allIn: false } })],
      result: { wonByFold: true, pots: [{ amount: 90, eligibleSeats: [0], winners: [{ seat: 0, playerId: 'ana', amount: 90 }] }], shown: [] },
    });
    expect(planMotion(prev, next, 'ana')).toEqual([
      { kind: 'chips', from: 'bet-0', to: 'pot', amount: 60, delay: TIMING.sweepDelay, fromPrevious: true },
      { kind: 'chips', from: 'pot', to: 'plaque-0', amount: 90, delay: TIMING.payoutDelay, float: true },
    ]);
  });
});
