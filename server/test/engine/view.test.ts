import type { Card, GameView } from '@poker/shared';
import { describe, expect, it } from 'vitest';
import { toGameView, type HandState } from '../../src/engine';
import { act, deal, newHand, pid, runOut } from './helpers';

const cards = (s: string) => s.split(' ') as [Card, Card];
const HOLE = { 0: cards('As Ah'), 1: cards('Kc Kd'), 2: cards('7s 2d') };
const BOARD: Card[] = ['2c', '8d', '9h', '3s', '4c'];
const start = () => newHand({ stacks: { 0: 1000, 1: 1000, 2: 1000 }, button: 0, hole: HOLE, board: BOARD });

const holeBySeat = (view: GameView) => Object.fromEntries(view.players.map((p) => [p.seat, p.holeCards]));
/** Every card of `seat` that appears anywhere in the serialized view. */
const leaked = (view: GameView, state: HandState, seat: number) => {
  const json = JSON.stringify(view);
  return state.players.find((p) => p.seat === seat)!.holeCards.filter((c) => json.includes(`"${c}"`));
};

describe('toGameView: hidden information', () => {
  it('shows each player only their own hole cards during the hand, and never the deck', () => {
    const s = act(start(), 0, 'call');
    for (const viewer of [0, 1, 2]) {
      const view = toGameView(s, pid(viewer));
      expect(view).not.toHaveProperty('deck');
      for (const other of [0, 1, 2]) {
        if (other === viewer) expect(holeBySeat(view)[other]).toEqual(HOLE[other as 0 | 1 | 2]);
        else expect(leaked(view, s, other)).toEqual([]);
      }
      for (const card of s.deck) expect(JSON.stringify(view)).not.toContain(`"${card}"`);
    }
  });

  it('shows nothing to someone who is not in the hand', () => {
    const view = toGameView(start(), 'spectator');
    expect(view.players.every((p) => p.holeCards === null)).toBe(true);
    expect(view.legalActions).toBeNull();
  });

  it("keeps the winner's cards hidden when everyone else folds (R-7.4)", () => {
    const s = act(act(start(), 0, 'fold'), 1, 'fold');
    expect(s.awaiting).toBe('none');
    expect(leaked(toGameView(s, pid(0)), s, 2)).toEqual([]);
    expect(toGameView(s, pid(0)).result?.shown).toEqual([]);
  });

  it('reveals every non-folded hand at showdown, but never a folded one (R-7.3)', () => {
    let s = act(act(act(start(), 0, 'call'), 1, 'call'), 2, 'check');
    s = deal(s);
    s = act(act(act(s, 1, 'check'), 2, 'bet', 20), 0, 'call');
    s = act(s, 1, 'fold'); // seat 1 folds on the flop
    for (let i = 0; i < 2; i++) s = act(act(deal(s), 2, 'check'), 0, 'check');
    expect(s.street).toBe('showdown');

    const forSeat1 = toGameView(s, pid(1));
    expect(holeBySeat(forSeat1)).toEqual({ 0: HOLE[0], 1: HOLE[1], 2: HOLE[2] }); // own folded cards are still theirs
    const forSeat0 = toGameView(s, pid(0));
    expect(holeBySeat(forSeat0)[2]).toEqual(HOLE[2]);
    expect(leaked(forSeat0, s, 1)).toEqual([]);
    expect(forSeat0.result?.shown.map((h) => h.seat)).toEqual([0, 2]);
  });

  it('reveals all-in hands as soon as betting is over, before the board is dealt (R-5.8)', () => {
    let s = act(start(), 0, 'allIn');
    s = act(act(s, 1, 'fold'), 2, 'call');
    expect(s.board).toEqual([]);
    expect(holeBySeat(toGameView(s, pid(1)))).toEqual({ 0: HOLE[0], 1: HOLE[1], 2: HOLE[2] });
    expect(leaked(toGameView(s, 'spectator'), s, 1)).toEqual([]); // the folded hand stays hidden
  });
});

describe('toGameView: table state', () => {
  it('gives legal actions only to the player whose turn it is', () => {
    const s = start();
    expect(toGameView(s, pid(0)).legalActions).toMatchObject({ canCall: true, callAmount: 10 });
    expect(toGameView(s, pid(1)).legalActions).toBeNull();
  });

  it("shows pots from earlier streets and this street's bets separately (R-6.5)", () => {
    let s = act(act(act(start(), 0, 'call'), 1, 'call'), 2, 'check');
    s = act(deal(s), 1, 'bet', 40);
    const view = toGameView(s, pid(0));
    expect(view.pots).toEqual([{ amount: 30, eligibleSeats: [0, 1, 2] }]);
    expect(view.players.map((p) => p.committed)).toEqual([0, 40, 0]);
    expect(view.players[1]?.lastAction).toEqual({ type: 'bet', amount: 40, allIn: false });
  });

  it('shows no pots once the hand is over; the result has them', () => {
    const s = runOut(act(act(act(start(), 0, 'allIn'), 1, 'fold'), 2, 'call'));
    const view = toGameView(s, pid(0));
    expect(view.pots).toEqual([]);
    expect(view.result?.pots[0]?.amount).toBe(2005);
  });

  it('carries the turn deadline and never shares objects with the engine state', () => {
    const s = start();
    const view = toGameView(s, pid(0), { turnDeadline: 123 });
    expect(view.turnDeadline).toBe(123);
    // The state is deep-frozen; editing the view must work and must not touch it.
    view.players[0]!.holeCards![0] = '2s';
    view.board.push('2s');
    expect(s.players[0]?.holeCards[0]).toBe('As');
    expect(s.board).toEqual([]);
  });
});
