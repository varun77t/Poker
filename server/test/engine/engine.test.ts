import type { Card } from '@poker/shared';
import { describe, expect, it } from 'vitest';
import { FULL_DECK, applyAction, buildPots, createHand, forceFold, getLegalActions, type HandState } from '../../src/engine';
import { act, deal, deepFreeze, fold, newHand, pid, reject, runOut, seatOf, stacks } from './helpers';

const cards = (s: string) => s.split(' ') as [Card, Card];
const potsOf = (state: HandState) =>
  buildPots(state.players.map((p) => ({ seat: p.seat, contributed: p.contributed, folded: p.status === 'folded' }))).pots;

describe('hand setup and turn order', () => {
  it('heads-up: the button posts the small blind, acts first preflop and last postflop (R-2.4, R-5.1, R-5.2)', () => {
    let s = newHand({ stacks: { 1: 1000, 3: 1000 }, button: 3 });
    expect([s.sbSeat, s.bbSeat]).toEqual([3, 1]);
    expect(stacks(s)).toEqual({ 1: 990, 3: 995 });
    expect(s.toActSeat).toBe(3);

    s = act(s, 3, 'call');
    expect(s.toActSeat).toBe(1); // BB option
    s = act(s, 1, 'check');
    expect(s.awaiting).toBe('deal');
    s = deal(s);
    expect(s.street).toBe('flop');
    expect(s.toActSeat).toBe(1);
    s = act(s, 1, 'check');
    expect(s.toActSeat).toBe(3);
  });

  it('3 players: blinds left of the button, the button acts first preflop, the SB first postflop (R-2.3, R-5.1, R-5.2)', () => {
    let s = newHand({ stacks: { 0: 1000, 2: 1000, 4: 1000 }, button: 2 });
    expect([s.sbSeat, s.bbSeat, s.toActSeat]).toEqual([4, 0, 2]);
    s = act(s, 2, 'call');
    s = act(s, 4, 'call');
    s = act(s, 0, 'check');
    s = deal(s);
    expect(s.toActSeat).toBe(4);
  });

  it('5 players: UTG opens preflop, the small blind opens postflop', () => {
    let s = newHand({ stacks: { 0: 1000, 1: 1000, 2: 1000, 3: 1000, 4: 1000 }, button: 0 });
    expect([s.sbSeat, s.bbSeat, s.toActSeat]).toEqual([1, 2, 3]);
    for (const seat of [3, 4, 0, 1]) s = act(s, seat, 'call');
    s = act(s, 2, 'check');
    s = deal(s);
    expect(s.toActSeat).toBe(1);
  });

  it('deals one card at a time from the left of the button, and burns before each street (R-2.7, R-3.2)', () => {
    const deck = [...FULL_DECK];
    let s = createHand({
      handId: 7,
      players: [0, 1, 2].map((seat) => ({ playerId: pid(seat), seat, stack: 1000 })),
      buttonSeat: 0,
      smallBlind: 5,
      bigBlind: 10,
      deck,
    }).state;
    expect(seatOf(s, 1).holeCards).toEqual([deck[0], deck[3]]);
    expect(seatOf(s, 2).holeCards).toEqual([deck[1], deck[4]]);
    expect(seatOf(s, 0).holeCards).toEqual([deck[2], deck[5]]);

    s = act(act(act(s, 0, 'call'), 1, 'call'), 2, 'check');
    s = deal(s);
    expect(s.board).toEqual([deck[7], deck[8], deck[9]]);
    for (const seat of [1, 2, 0]) s = act(s, seat, 'check');
    s = deal(s);
    expect(s.board[3]).toBe(deck[11]);
    for (const seat of [1, 2, 0]) s = act(s, seat, 'check');
    s = deal(s);
    expect(s.board[4]).toBe(deck[13]);
  });

  it('counts seq up on every change', () => {
    let s = newHand({ stacks: { 0: 1000, 1: 1000 }, button: 0 });
    expect(s.seq).toBe(0);
    s = act(s, 0, 'call');
    expect(s.seq).toBe(1);
    s = act(s, 1, 'check');
    s = deal(s);
    expect(s.seq).toBe(3);
  });

  it('rejects invalid hand input', () => {
    const base = {
      handId: 1,
      players: [0, 1].map((seat) => ({ playerId: pid(seat), seat, stack: 100 })),
      buttonSeat: 0,
      smallBlind: 5,
      bigBlind: 10,
      deck: [...FULL_DECK],
    };
    expect(() => createHand({ ...base, players: base.players.slice(0, 1) })).toThrow(); // R-2.1
    expect(() => createHand({ ...base, players: [base.players[0]!, { playerId: 'x', seat: 1, stack: 0 }] })).toThrow();
    expect(() => createHand({ ...base, players: [base.players[0]!, { playerId: 'x', seat: 0, stack: 50 }] })).toThrow();
    expect(() => createHand({ ...base, players: [base.players[0]!, { playerId: 'x', seat: 5, stack: 50 }] })).toThrow();
    expect(() => createHand({ ...base, buttonSeat: 3 })).toThrow();
    expect(() => createHand({ ...base, smallBlind: 20 })).toThrow();
    expect(() => createHand({ ...base, deck: FULL_DECK.slice(0, 11) })).toThrow();
    expect(() => createHand({ ...base, deck: ['As', ...FULL_DECK.slice(1, 20), 'As'] })).toThrow();
  });
});

describe('big blind option (R-5.6)', () => {
  const limped = () => {
    let s = newHand({ stacks: { 0: 1000, 1: 1000, 2: 1000 }, button: 0 });
    s = act(s, 0, 'call');
    return act(s, 1, 'call');
  };

  it('lets the big blind check when everyone limps', () => {
    const s = limped();
    expect(s.toActSeat).toBe(2);
    expect(getLegalActions(s, pid(2))).toMatchObject({ canCheck: true, canRaise: true, minTo: 20 });
    expect(act(s, 2, 'check').awaiting).toBe('deal');
  });

  it('reopens action when the big blind raises', () => {
    const s = act(limped(), 2, 'raise', 30);
    expect(s.awaiting).toBe('action');
    expect(s.toActSeat).toBe(0);
    expect(getLegalActions(s, pid(0))).toMatchObject({ canCall: true, callAmount: 20, canRaise: true, minTo: 50 });
  });
});

describe('bet and raise sizes (R-4.1 – R-4.4)', () => {
  it('enforces the minimum raise and tracks the last full raise', () => {
    let s = newHand({ stacks: { 0: 1000, 1: 1000, 2: 1000, 3: 1000 }, button: 0 });
    expect(reject(s, 3, { type: 'raise', amount: 19 }).code).toBe('INVALID_AMOUNT');
    s = act(s, 3, 'raise', 30); // raise TO 30: an increase of 20
    expect([s.betLevel, s.minRaise]).toEqual([30, 20]);
    expect(getLegalActions(s, pid(0))?.minTo).toBe(50);
    s = act(s, 0, 'raise', 80);
    expect([s.betLevel, s.minRaise]).toEqual([80, 50]);
    expect(reject(s, 1, { type: 'raise', amount: 129 }).code).toBe('INVALID_AMOUNT');
    expect(reject(s, 1, { type: 'raise', amount: 1001 }).code).toBe('INVALID_AMOUNT');
    s = act(s, 1, 'raise', 130);
    expect(seatOf(s, 1)).toMatchObject({ committed: 130, stack: 870 });
  });

  it('requires a bet of at least the big blind postflop', () => {
    let s = newHand({ stacks: { 0: 1000, 1: 1000 }, button: 0 });
    s = deal(act(act(s, 0, 'call'), 1, 'check'));
    expect(reject(s, 1, { type: 'bet', amount: 9 }).code).toBe('INVALID_AMOUNT');
    s = act(s, 1, 'bet', 10);
    expect(getLegalActions(s, pid(0))).toMatchObject({ canRaise: true, minTo: 20, maxTo: 990 });
  });

  it('allows a bet below the big blind only as an all-in', () => {
    let s = newHand({ stacks: { 0: 16, 1: 1000 }, button: 0 });
    s = deal(act(act(s, 0, 'call'), 1, 'check')); // seat 0 has 6 left
    s = act(s, 1, 'check');
    expect(getLegalActions(s, pid(0))).toMatchObject({ canBet: true, minTo: 6, maxTo: 6 });
    expect(reject(s, 0, { type: 'bet', amount: 5 }).code).toBe('INVALID_AMOUNT');
    s = act(s, 0, 'bet', 6);
    expect(seatOf(s, 0).status).toBe('allIn');
  });
});

describe('short all-ins and raise rights (R-4.4, R-4.5)', () => {
  it('a short all-in raise does not reopen action for a player who already acted', () => {
    // Seats: 0 button (150 chips), 1 SB, 2 BB, 3 UTG. Preflop order: 3, 0, 1, 2.
    let s = newHand({ stacks: { 0: 150, 1: 1000, 2: 1000, 3: 1000 }, button: 0 });
    s = act(s, 3, 'raise', 100); // full raise: min raise is now 90
    s = act(s, 0, 'allIn'); // to 150: only 50 more, a short all-in
    expect([s.betLevel, s.minRaise]).toEqual([150, 90]);
    s = act(s, 1, 'fold');
    // The big blind has not acted yet, so it may still raise.
    expect(getLegalActions(s, pid(2))).toMatchObject({ canRaise: true, minTo: 240 });
    s = act(s, 2, 'call');
    // UTG already acted at 100 and only faces 50 more: call or fold only.
    expect(getLegalActions(s, pid(3))).toMatchObject({ canCall: true, callAmount: 50, canRaise: false });
    expect(reject(s, 3, { type: 'raise', amount: 240 }).code).toBe('ILLEGAL_ACTION');
    expect(reject(s, 3, { type: 'allIn' }).code).toBe('ILLEGAL_ACTION');
    s = act(s, 3, 'call');
    expect(s.awaiting).toBe('deal');
  });

  it('two short all-ins that together make a full raise reopen action', () => {
    // Seats: 0 button (200), 1 SB, 2 BB, 3 UTG, 4 CO (150). Preflop order: 3, 4, 0, 1, 2.
    let s = newHand({ stacks: { 0: 200, 1: 1000, 2: 1000, 3: 1000, 4: 150 }, button: 0 });
    s = act(s, 3, 'raise', 100);
    s = act(s, 4, 'allIn'); // 150: +50
    s = act(s, 0, 'allIn'); // 200: +50 again
    s = act(act(s, 1, 'fold'), 2, 'call'); // the big blind stays in, so a raise can still be answered
    // UTG faces 100 more since acting: at least the 90 minimum raise, so raising is open again.
    expect(getLegalActions(s, pid(3))).toMatchObject({ canRaise: true, minTo: 290 });
    s = act(s, 3, 'raise', 290);
    expect(s.betLevel).toBe(290);
  });

  it('allows only call or fold when nobody else could respond to a raise (R-4.8)', () => {
    let s = newHand({ stacks: { 0: 500, 1: 1000 }, button: 0 });
    s = act(s, 0, 'allIn');
    expect(getLegalActions(s, pid(1))).toEqual({
      canFold: true,
      canCheck: false,
      canCall: true,
      callAmount: 490,
      canBet: false,
      canRaise: false,
      minTo: 0,
      maxTo: 0,
    });
    expect(reject(s, 1, { type: 'raise', amount: 1000 }).code).toBe('ILLEGAL_ACTION');
    expect(reject(s, 1, { type: 'allIn' }).code).toBe('ILLEGAL_ACTION');
  });
});

describe('uncalled chips and folds', () => {
  it('returns an uncalled bet when everyone folds to it (R-6.2, R-5.4)', () => {
    let s = newHand({ stacks: { 0: 1000, 1: 1000 }, button: 0 });
    s = deal(act(act(s, 0, 'call'), 1, 'check'));
    s = act(s, 1, 'bet', 100);
    s = act(s, 0, 'fold');
    expect(s.awaiting).toBe('none');
    expect(s.log).toContainEqual({ type: 'uncalledReturned', seat: 1, amount: 100 });
    expect(stacks(s)).toEqual({ 0: 990, 1: 1010 });
    expect(s.result).toMatchObject({ wonByFold: true, shown: [] });
  });

  it('returns the part of an all-in that nobody could match', () => {
    let s = newHand({
      stacks: { 0: 1000, 1: 400 },
      button: 0,
      hole: { 0: cards('Kc Kd'), 1: cards('Ac Ad') },
      board: ['2h', '7s', '9h', '3s', '4d'],
    });
    s = act(s, 0, 'allIn');
    s = act(s, 1, 'allIn'); // a call for less
    expect(s.log).toContainEqual({ type: 'uncalledReturned', seat: 0, amount: 600 });
    expect(seatOf(s, 0)).toMatchObject({ stack: 600, status: 'active' });
    s = runOut(s);
    expect(stacks(s)).toEqual({ 0: 600, 1: 800 });
  });

  it('everyone folding to the big blind wins the blinds without a showdown (R-5.4, R-7.4)', () => {
    let s = newHand({ stacks: { 0: 1000, 1: 1000, 2: 1000 }, button: 0 });
    s = act(act(s, 0, 'fold'), 1, 'fold');
    expect(s.awaiting).toBe('none');
    expect(stacks(s)).toEqual({ 0: 1000, 1: 995, 2: 1005 });
    expect(s.result).toEqual({
      wonByFold: true,
      pots: [{ amount: 10, eligibleSeats: [2], winners: [{ seat: 2, playerId: 'p2', amount: 10 }] }],
      shown: [],
    });
    expect(s.allRevealed).toBe(false);
  });
});

describe('short stacks and all-ins', () => {
  it('a short big blind posts all-in, and others still call the full big blind (R-2.5, R-2.6)', () => {
    let s = newHand({ stacks: { 0: 1000, 1: 1000, 2: 6 }, button: 0 });
    expect(seatOf(s, 2)).toMatchObject({ committed: 6, stack: 0, status: 'allIn' });
    expect(s.betLevel).toBe(10);
    expect(getLegalActions(s, pid(0))).toMatchObject({ callAmount: 10, minTo: 20 });
    s = act(s, 0, 'call');
    s = act(s, 1, 'call');
    expect(s.awaiting).toBe('deal');
    expect(potsOf(s)).toEqual([
      { amount: 18, eligibleSeats: [0, 1, 2] },
      { amount: 8, eligibleSeats: [0, 1] },
    ]);
  });

  it('a small blind that covers a short big blind needs no action: the rest is a run-out (R-5.7)', () => {
    const s = newHand({ stacks: { 0: 1000, 1: 3 }, button: 0 });
    // Heads-up: seat 0 posts 5 as the button, seat 1 is all-in for 3. Nobody can bet.
    expect(s.awaiting).toBe('deal');
    expect(s.allRevealed).toBe(true);
    expect(s.log).toContainEqual({ type: 'uncalledReturned', seat: 0, amount: 2 });
  });

  it('all-in preflop runs the board out and goes to showdown (R-5.7, R-5.8)', () => {
    let s = newHand({
      stacks: { 0: 500, 1: 500 },
      button: 0,
      hole: { 0: cards('As Ah'), 1: cards('Kc Kd') },
      board: ['2c', '7d', '9h', '3s', '4c'],
    });
    s = act(s, 0, 'allIn');
    s = act(s, 1, 'call');
    expect([s.awaiting, s.allRevealed, s.toActSeat]).toEqual(['deal', true, null]);
    s = deal(s);
    expect([s.street, s.awaiting]).toEqual(['flop', 'deal']);
    s = runOut(s);
    expect([s.street, s.awaiting, s.board]).toEqual(['showdown', 'none', ['2c', '7d', '9h', '3s', '4c']]);
    expect(stacks(s)).toEqual({ 0: 1000, 1: 0 });
    expect(s.result?.shown.map((h) => h.label)).toEqual(['Pair of Aces', 'Pair of Kings']);
    const types = s.log.map((e) => e.type);
    expect(types.indexOf('handsRevealed')).toBeLessThan(types.indexOf('streetDealt'));
  });

  it('pays a main pot and two side pots from four different stacks (R-6.1 – R-6.3)', () => {
    let s = newHand({
      stacks: { 0: 100, 1: 250, 2: 400, 3: 400 },
      button: 3,
      hole: { 0: cards('Ac Ad'), 1: cards('Kc Kd'), 2: cards('Qc Qd'), 3: cards('Jc Jd') },
      board: ['2h', '7s', '9h', '3s', '4d'],
    });
    // Button 3 → SB 0, BB 1, and seat 2 acts first.
    s = act(s, 2, 'allIn');
    s = act(s, 3, 'call');
    s = act(s, 0, 'allIn');
    s = act(s, 1, 'allIn');
    s = runOut(s);
    expect(s.result?.pots).toEqual([
      { amount: 400, eligibleSeats: [0, 1, 2, 3], winners: [{ seat: 0, playerId: 'p0', amount: 400 }] },
      { amount: 450, eligibleSeats: [1, 2, 3], winners: [{ seat: 1, playerId: 'p1', amount: 450 }] },
      { amount: 300, eligibleSeats: [2, 3], winners: [{ seat: 2, playerId: 'p2', amount: 300 }] },
    ]);
    expect(stacks(s)).toEqual({ 0: 400, 1: 450, 2: 300, 3: 0 });
  });

  it("puts folded players' chips into the right pots (R-6.1)", () => {
    // Seats: 0 button (40 chips), 1 SB, 2 BB, 3 UTG.
    let s = newHand({
      stacks: { 0: 40, 1: 1000, 2: 1000, 3: 1000 },
      button: 0,
      hole: { 0: cards('Ac Ad'), 3: cards('Kc Kd') },
      board: ['2h', '7s', '9h', '3s', '4d'],
    });
    s = act(s, 3, 'raise', 60);
    s = act(s, 0, 'allIn'); // a call for less: 40
    s = act(s, 1, 'fold'); // 5 left in the pot
    s = act(s, 2, 'call');
    s = deal(s);
    s = act(s, 2, 'check');
    s = act(s, 3, 'bet', 100);
    s = act(s, 2, 'fold');
    expect(s.log).toContainEqual({ type: 'uncalledReturned', seat: 3, amount: 100 });
    s = runOut(s);
    expect(s.result?.pots.map(({ amount, eligibleSeats, winners }) => ({ amount, eligibleSeats, won: winners.map((w) => w.seat) }))).toEqual([
      { amount: 125, eligibleSeats: [0, 3], won: [0] }, // 5 from SB + 40 each from 0, 2 and 3
      { amount: 40, eligibleSeats: [3], won: [3] }, // the other 20 each from 2 and 3
    ]);
    expect(stacks(s)).toEqual({ 0: 125, 1: 995, 2: 940, 3: 980 });
  });
});

describe('showdown', () => {
  it('splits a tied pot and gives the odd chip to the first winner left of the button (R-7.2)', () => {
    // The board is a straight that plays for both remaining players.
    let s = newHand({
      stacks: { 0: 1000, 1: 1000, 2: 1000 },
      button: 0,
      hole: { 0: cards('2c 2d'), 1: cards('Kc Kd'), 2: cards('3h 3s') },
      board: ['5c', '6d', '7h', '8s', '9c'],
    });
    s = act(s, 0, 'call');
    s = act(s, 1, 'fold'); // leaves 5: the pot is 25
    s = act(s, 2, 'check');
    for (let street = 0; street < 3; street++) {
      s = deal(s);
      s = act(act(s, 2, 'check'), 0, 'check');
    }
    expect(s.result?.pots).toEqual([
      {
        amount: 25,
        eligibleSeats: [0, 2],
        winners: [
          { seat: 2, playerId: 'p2', amount: 13 },
          { seat: 0, playerId: 'p0', amount: 12 },
        ],
      },
    ]);
    expect(s.result?.shown.map((h) => h.seat)).toEqual([0, 2]); // the folded hand is never shown
  });
});

describe('forceFold (R-9.1)', () => {
  const threeWay = () => newHand({ stacks: { 0: 1000, 1: 1000, 2: 1000 }, button: 0 });

  it('folds a player out of turn without moving the turn', () => {
    const s = fold(threeWay(), 1);
    expect(seatOf(s, 1).status).toBe('folded');
    expect(s.toActSeat).toBe(0);
    expect(s.seq).toBe(1);
  });

  it('passes the turn on when the player to act is folded', () => {
    const s = fold(threeWay(), 0);
    expect(s.toActSeat).toBe(1);
  });

  it('ends the hand when only one player is left', () => {
    const s = fold(fold(threeWay(), 0), 1);
    expect(s.awaiting).toBe('none');
    expect(stacks(s)).toEqual({ 0: 1000, 1: 995, 2: 1005 });
  });

  it('gives the blinds to a player who has not acted when both blinds leave (dead money)', () => {
    // Button (seat 0) is to act and has put nothing in; SB and BB both leave.
    const s = fold(fold(threeWay(), 1), 2);
    expect(s.awaiting).toBe('none');
    expect(s.log).toContainEqual({ type: 'uncalledReturned', seat: 2, amount: 5 });
    expect(stacks(s)).toEqual({ 0: 1010, 1: 995, 2: 995 });
    expect(s.result?.pots).toEqual([{ amount: 10, eligibleSeats: [0], winners: [{ seat: 0, playerId: 'p0', amount: 10 }] }]);
  });

  it('leaves an all-in player in the hand, and ignores finished hands', () => {
    const s = act(newHand({ stacks: { 0: 500, 1: 1000, 2: 1000 }, button: 0 }), 0, 'allIn');
    const same = forceFold(s, pid(0));
    expect(same.state).toBe(s);
    expect(same.events).toEqual([]);

    const over = fold(fold(threeWay(), 0), 1);
    expect(forceFold(over, pid(2)).state).toBe(over);
  });

  it('between streets, turns the rest into a run-out when nobody can bet any more', () => {
    let s = newHand({ stacks: { 0: 100, 1: 1000, 2: 1000 }, button: 0 });
    s = act(act(act(s, 0, 'allIn'), 1, 'call'), 2, 'call');
    expect([s.awaiting, s.allRevealed]).toEqual(['deal', false]);
    s = fold(s, 2);
    expect(s.allRevealed).toBe(true);
    s = runOut(s);
    expect(s.awaiting).toBe('none');
    expect(Object.values(stacks(s)).reduce((a, b) => a + b)).toBe(2100);
  });
});

describe('illegal actions (R-4, R-4.7)', () => {
  const start = () => newHand({ stacks: { 0: 1000, 1: 1000, 2: 1000 }, button: 0 }); // seat 0 to act

  it('rejects the wrong player', () => {
    expect(reject(start(), 1, { type: 'call' }).code).toBe('NOT_YOUR_TURN');
    expect(applyAction(start(), 'nobody', { type: 'fold' })).toMatchObject({ ok: false, error: { code: 'NOT_YOUR_TURN' } });
  });

  it('rejects actions that do not fit the situation', () => {
    const s = start();
    expect(reject(s, 0, { type: 'check' }).code).toBe('ILLEGAL_ACTION');
    expect(reject(s, 0, { type: 'bet', amount: 20 }).code).toBe('ILLEGAL_ACTION');
    expect(reject(s, 0, { type: 'dance' } as never).code).toBe('ILLEGAL_ACTION');
  });

  it('rejects bad amounts', () => {
    const s = start();
    for (const amount of [15, 1001, -20, 20.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(reject(s, 0, { type: 'raise', amount }).code, String(amount)).toBe('INVALID_AMOUNT');
    }
    expect(reject(s, 0, { type: 'raise' }).code).toBe('INVALID_AMOUNT');
    expect(reject(s, 0, { type: 'raise', amount: '40' } as never).code).toBe('INVALID_AMOUNT');
    expect(reject(s, 0, { type: 'fold', amount: 0 }).code).toBe('INVALID_AMOUNT');
  });

  it('rejects calling when there is nothing to call', () => {
    const s = deal(act(act(act(start(), 0, 'call'), 1, 'call'), 2, 'check'));
    expect(reject(s, 1, { type: 'call' }).code).toBe('ILLEGAL_ACTION');
    expect(reject(s, 1, { type: 'raise', amount: 20 }).code).toBe('ILLEGAL_ACTION');
  });

  it('rejects folded players, dealing pauses and finished hands', () => {
    let s = act(start(), 0, 'fold');
    expect(reject(s, 0, { type: 'call' })).toEqual({ code: 'NOT_YOUR_TURN', message: 'You have folded this hand.' });
    s = act(act(s, 1, 'call'), 2, 'check');
    expect(reject(s, 1, { type: 'check' }).code).toBe('INVALID_STATE');
    s = act(deal(s), 1, 'bet', 50);
    s = act(s, 2, 'fold');
    expect(reject(s, 1, { type: 'check' })).toEqual({ code: 'INVALID_STATE', message: 'This hand is over.' });
  });

  it('never changes the state it was given', () => {
    const s = start();
    const before = structuredClone(s);
    const res = applyAction(s, pid(0), { type: 'raise', amount: 40 });
    expect(res.ok && res.state).not.toBe(s);
    expect(s).toEqual(before); // (and s is deep-frozen, so any write would have thrown)
  });
});

describe('public log', () => {
  it('never contains a hole card', () => {
    let s = newHand({ stacks: { 0: 300, 1: 300, 2: 300 }, button: 0 });
    s = act(act(act(s, 0, 'allIn'), 1, 'allIn'), 2, 'allIn');
    s = runOut(deepFreeze(s));
    const log = JSON.stringify(s.log);
    for (const p of s.players) for (const card of p.holeCards) expect(log).not.toContain(`"${card}"`);
  });
});
