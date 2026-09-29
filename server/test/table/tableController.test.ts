import { DEFAULT_ROOM_SETTINGS } from '@poker/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { members } from '../../src/rooms/room';
import { expectDomainError } from '../helpers/errors';
import { TIMINGS, TURN_MS, createTableHarness, type TableHarness } from '../helpers/table';

const sum = (values: (number | null)[]) => values.reduce<number>((acc, v) => acc + (v ?? 0), 0);

/**
 * Plays the current hand to its end: connected players check when they can and fold otherwise;
 * everything else (disconnected players' turns, dealing) is left to the timers.
 */
function playOut(h: TableHarness): void {
  for (let guard = 0; guard < 100; guard++) {
    const g = h.game();
    if (g.result) return;
    const actor = g.toActSeat === null ? null : h.room.seats[g.toActSeat];
    if (!actor?.connected) {
      h.clock.runNext();
      continue;
    }
    const legal = h.game(actor.playerId).legalActions;
    h.act(actor.playerId, legal?.canCheck ? 'check' : 'fold');
  }
  throw new Error('Hand did not finish');
}

let harness: TableHarness | null = null;
/** Every test's harness must end without server-side errors (e.g. a failing timer callback). */
function table(...args: Parameters<typeof createTableHarness>): TableHarness {
  harness = createTableHarness(...args);
  return harness;
}
afterEach(() => {
  expect(harness?.errors ?? []).toEqual([]);
  harness = null;
});

describe('dealing', () => {
  it('deals the first hand to every member when the host starts', () => {
    const h = table(['alice', 'bob', 'carol']);
    h.start();

    expect(h.room.status).toBe('playing');
    expect(h.game()).toMatchObject({
      handId: 1,
      street: 'preflop',
      buttonSeat: 0,
      sbSeat: 1,
      bbSeat: 2,
      toActSeat: 0,
      turnDeadline: h.clock.now() + TURN_MS,
    });
    // Everyone sees exactly their own cards; someone outside the hand sees none (R-7.3).
    for (const id of ['alice', 'bob', 'carol']) {
      expect(h.game(id).players.map((p) => p.holeCards !== null)).toEqual(['alice', 'bob', 'carol'].map((x) => x === id));
    }
    expect(h.game('stranger').players.every((p) => p.holeCards === null)).toBe(true);
    expect(h.game('alice').legalActions).toMatchObject({ canCall: true, callAmount: 10 });
    expect(h.game('bob').legalActions).toBeNull();

    // Seats show what each player has left behind during the hand.
    const room = h.snapshot('alice').room;
    expect(room.seats.map((s) => s?.stack ?? null)).toEqual([1000, 995, 990, null, null]);
    expect(room.table).toEqual({ nextHandAt: null, waitingForPlayers: false, endingAfterHand: false });
    expect(h.room.table?.pendingTimer).toBe('turn');
  });

  it('moves the button every hand and keeps the chip total', () => {
    const h = table(['alice', 'bob', 'carol']);
    h.start();
    const buttons: number[] = [];
    for (let hand = 1; hand <= 4; hand++) {
      expect(h.game().handId).toBe(hand);
      buttons.push(h.game().buttonSeat);
      while (!h.game().result) h.act(h.toAct(), 'fold'); // folds to the big blind
      expect(h.game().result?.wonByFold).toBe(true);
      expect(sum(h.seatStacks())).toBe(3000);
      h.clock.advance(TIMINGS.foldWinPauseMs);
    }
    expect(buttons).toEqual([0, 1, 2, 0]); // R-2.2
  });

  it('bumps the room version once for every change players can see', () => {
    const h = table(['alice', 'bob']);
    h.start();
    const start = h.room.version;
    h.changes.length = 0;
    h.act('alice', 'call');
    h.act('bob', 'check'); // closes the round
    h.clock.advance(TIMINGS.streetDelayMs); // deals the flop
    expect(h.changes).toHaveLength(3);
    expect(h.room.version).toBe(start + 3);
  });
});

describe('actions', () => {
  it('rejects stale, out-of-turn and illegal actions without changing anything', () => {
    const h = table(['alice', 'bob', 'carol']);
    h.start();
    const { handId, seq } = h.game();
    const version = h.room.version;

    expectDomainError(() => h.rooms.act('alice', { handId, seq: seq + 1, type: 'call' }), 'STALE_ACTION');
    expectDomainError(() => h.rooms.act('alice', { handId: handId + 1, seq, type: 'call' }), 'STALE_ACTION');
    expectDomainError(() => h.rooms.act('bob', { handId, seq, type: 'call' }), 'NOT_YOUR_TURN');
    expectDomainError(() => h.rooms.act('alice', { handId, seq, type: 'check' }), 'ILLEGAL_ACTION');
    expectDomainError(() => h.rooms.act('alice', { handId, seq, type: 'raise', amount: 15 }), 'INVALID_AMOUNT');
    expectDomainError(() => h.rooms.act('alice', { handId, seq, type: 'raise' }), 'INVALID_AMOUNT');
    expectDomainError(() => h.rooms.act('alice', { handId, seq, type: 'call', amount: 10 }), 'INVALID_AMOUNT');
    expectDomainError(() => h.rooms.act('stranger', { handId, seq, type: 'call' }), 'NOT_IN_ROOM');
    expect(h.room.version).toBe(version);
    expect(h.game().seq).toBe(seq);

    // A double click: the first call goes through, the identical second one is stale.
    h.rooms.act('alice', { handId, seq, type: 'call' });
    expectDomainError(() => h.rooms.act('alice', { handId, seq, type: 'call' }), 'STALE_ACTION');
    expect(h.game().toActSeat).toBe(1);
  });

  it('rejects actions before the game starts and from players waiting for the next hand', () => {
    const h = table(['alice', 'bob']);
    expectDomainError(() => h.rooms.act('alice', { handId: 0, seq: 0, type: 'check' }), 'INVALID_STATE');
    h.start();
    h.join('dave');
    const { handId, seq } = h.game();
    expectDomainError(() => h.rooms.act('dave', { handId, seq, type: 'fold' }), 'NOT_YOUR_TURN');
  });

  it('rejects actions while the next street is being dealt', () => {
    const h = table(['alice', 'bob']);
    h.start();
    h.act('alice', 'call');
    h.act('bob', 'check');
    const { handId, seq, toActSeat } = h.game();
    expect(toActSeat).toBeNull();
    expectDomainError(() => h.rooms.act('bob', { handId, seq, type: 'check' }), 'INVALID_STATE');
  });
});

describe('turn timer (R-9.2)', () => {
  it("folds a player facing a bet when their time runs out, then starts the next player's clock", () => {
    const h = table(['alice', 'bob', 'carol']);
    h.start();
    h.clock.advance(TURN_MS - 1);
    expect(h.game().players[0]?.status).toBe('active');
    h.clock.advance(1);
    const g = h.game();
    expect(g.players[0]).toMatchObject({ status: 'folded', lastAction: { type: 'fold' } });
    expect(g).toMatchObject({ toActSeat: 1, turnDeadline: h.clock.now() + TURN_MS });
  });

  it("checks instead when checking is legal (the big blind's option)", () => {
    const h = table(['alice', 'bob', 'carol']);
    h.start();
    h.act('alice', 'call');
    h.act('bob', 'call');
    expect(h.game('carol').legalActions?.canCheck).toBe(true);
    h.clock.advance(TURN_MS);
    expect(h.game()).toMatchObject({ street: 'preflop', toActSeat: null, turnDeadline: null });
    expect(h.game().players[2]?.lastAction).toEqual({ type: 'check', allIn: false });

    expect(h.room.table?.pendingTimer).toBe('deal');
    h.clock.advance(TIMINGS.streetDelayMs);
    expect(h.game()).toMatchObject({ street: 'flop', toActSeat: 1 });
    expect(h.game().board).toHaveLength(3);
  });

  it('acting just before the deadline cancels the timer; the next player gets a full turn', () => {
    const h = table(['alice', 'bob', 'carol']);
    h.start();
    h.clock.advance(TURN_MS - 1);
    h.act('alice', 'call');
    expect(h.game().turnDeadline).toBe(h.clock.now() + TURN_MS);
    h.clock.advance(TURN_MS - 1);
    expect(h.game().players[0]?.status).toBe('active'); // alice's old timer never fires
    expect(h.game().players[1]?.status).toBe('active');
    h.clock.advance(1);
    expect(h.game().players[1]?.status).toBe('folded');
  });

  it("someone leaving does not restart the clock of the player whose turn it is", () => {
    const h = table(['alice', 'bob', 'carol', 'dave']);
    h.start();
    expect(h.toAct()).toBe('dave');
    const deadline = h.game().turnDeadline;
    h.clock.advance(10_000);
    h.rooms.leave('bob');
    expect(h.game()).toMatchObject({ toActSeat: 3, turnDeadline: deadline });
    h.clock.advance(TURN_MS - 10_000);
    expect(h.game().players.find((p) => p.seat === 3)?.status).toBe('folded');
  });
});

describe('pacing', () => {
  it('runs out an all-in hand one street at a time, then shows the result before the next hand', () => {
    // A royal flush on the board: both players play the board and split (R-8.4).
    const h = table(['alice', 'bob'], {
      hands: { 1: { hole: { 0: ['2c', '3d'], 1: ['4c', '5d'] }, board: ['As', 'Ks', 'Qs', 'Js', 'Ts'] } },
    });
    h.start();
    h.act('alice', 'allIn');
    h.act('bob', 'call');
    expect(h.game('alice').players.every((p) => p.holeCards !== null)).toBe(true); // R-5.8: revealed at once
    expect(h.room.table?.pendingTimer).toBe('deal');

    const boardAfter = (ms: number) => {
      h.clock.advance(ms);
      return h.game().board.length;
    };
    expect(boardAfter(TIMINGS.runOutDelayMs - 1)).toBe(0);
    expect(boardAfter(1)).toBe(3);
    expect(boardAfter(TIMINGS.runOutDelayMs)).toBe(4);
    expect(boardAfter(TIMINGS.runOutDelayMs)).toBe(5);

    const { result } = h.game();
    expect(result?.wonByFold).toBe(false);
    expect(result?.pots[0]?.winners.map((w) => w.amount)).toEqual([1000, 1000]);
    expect(h.snapshot('alice').room.table?.nextHandAt).toBe(h.clock.now() + TIMINGS.showdownPauseMs);
    expect(h.seatStacks()).toEqual([1000, 1000, null, null, null]);

    h.clock.advance(TIMINGS.showdownPauseMs - 1);
    expect(h.game().handId).toBe(1);
    h.clock.advance(1);
    expect(h.game()).toMatchObject({ handId: 2, buttonSeat: 1, street: 'preflop' });
    expect(h.snapshot('alice').room.table?.nextHandAt).toBeNull();
  });

  it('pauses for less time after a hand won by folds', () => {
    const h = table(['alice', 'bob']);
    h.start();
    h.act('alice', 'fold');
    expect(h.game().result?.wonByFold).toBe(true);
    h.clock.advance(TIMINGS.foldWinPauseMs - 1);
    expect(h.game().handId).toBe(1);
    h.clock.advance(1);
    expect(h.game().handId).toBe(2);
  });
});

describe('between hands', () => {
  it('pays out to the seats; a busted player is not dealt in and shows as busted', () => {
    const h = table(['alice', 'bob', 'carol'], {
      hands: { 1: { hole: { 0: ['Ah', 'Ad'], 2: ['Kc', 'Kd'] }, board: ['2c', '7d', '9h', 'Js', '3s'] } },
    });
    h.start();
    h.act('alice', 'allIn');
    h.act('bob', 'fold');
    h.act('carol', 'call');
    for (let i = 0; i < 3; i++) h.clock.advance(TIMINGS.runOutDelayMs);
    expect(h.game().result?.pots).toEqual([
      { amount: 2005, eligibleSeats: [0, 2], winners: [{ seat: 0, playerId: 'alice', amount: 2005 }] },
    ]);
    expect(h.seatStacks()).toEqual([2005, 995, 0, null, null]);

    h.clock.advance(TIMINGS.showdownPauseMs);
    const g = h.game();
    expect(g.players.map((p) => p.playerId)).toEqual(['alice', 'bob']); // R-10.1
    expect(g.buttonSeat).toBe(1);
    expect(h.snapshot('carol').room.seats[2]).toMatchObject({ stack: 0, busted: true });
    expect(h.snapshot('carol').room.seats[0]).toMatchObject({ busted: false });
    expectDomainError(() => h.rooms.act('carol', { handId: g.handId, seq: g.seq, type: 'fold' }), 'NOT_YOUR_TURN');
  });

  it('waits for players when fewer than two have chips, and deals again when someone joins', () => {
    const h = table(['alice', 'bob'], {
      hands: { 1: { hole: { 0: ['Ah', 'Ad'], 1: ['Kc', 'Kd'] }, board: ['2c', '7d', '9h', 'Js', '3s'] } },
    });
    h.start();
    h.act('alice', 'allIn');
    h.act('bob', 'call');
    for (let i = 0; i < 3; i++) h.clock.advance(TIMINGS.runOutDelayMs);
    h.clock.advance(TIMINGS.showdownPauseMs);

    expect(h.room.table?.gameView('alice')).toBeNull();
    expect(h.snapshot('alice').room.table).toEqual({ nextHandAt: null, waitingForPlayers: true, endingAfterHand: false }); // R-10.4 (rebuys on)
    expect(h.room.table?.pendingTimer).toBeNull();
    expect(h.snapshot('alice').room.seats[1]).toMatchObject({ stack: 0, busted: true });

    h.join('carol');
    expect(h.game()).toMatchObject({ handId: 2, buttonSeat: 2 });
    expect(h.game().players.map((p) => p.playerId)).toEqual(['alice', 'carol']);
    expect(h.snapshot('carol').room.seats[2]?.waitingForNextHand).toBe(false);
  });

  it('seats late joiners for the next hand; until then they see no hole cards', () => {
    const h = table(['alice', 'bob', 'carol']);
    h.start();
    h.join('dave');
    expect(h.snapshot('dave').room.seats[3]).toMatchObject({ playerId: 'dave', waitingForNextHand: true });
    const view = h.game('dave');
    expect(view.players.map((p) => p.playerId)).toEqual(['alice', 'bob', 'carol']);
    expect(view.players.every((p) => p.holeCards === null)).toBe(true);
    expect(view.legalActions).toBeNull();

    h.act('alice', 'fold');
    h.act('bob', 'fold');
    h.clock.advance(TIMINGS.foldWinPauseMs);
    expect(h.game().players.map((p) => p.playerId)).toEqual(['alice', 'bob', 'carol', 'dave']); // R-10.3
    expect(h.game('dave').players[3]?.holeCards).not.toBeNull();
    expect(h.snapshot('dave').room.seats[3]?.waitingForNextHand).toBe(false);
  });
});

describe('leaving mid-hand (R-9.1)', () => {
  it('folds the leaver at once, keeps their seat until the hand is over, then frees it', () => {
    const h = table(['alice', 'bob', 'carol']);
    h.start();
    h.rooms.leave('bob');

    expect(h.rooms.getRoomOf('bob')).toBeUndefined();
    expect(h.game().players[1]).toMatchObject({ playerId: 'bob', status: 'folded' });
    expect(h.game().toActSeat).toBe(0);
    expect(h.snapshot('alice').room.seats[1]).toMatchObject({ playerId: 'bob', leaving: true });
    expect(members(h.room).map((s) => s.playerId)).toEqual(['alice', 'carol']); // bob gets no more snapshots

    // Bob is free to go elsewhere straight away.
    const other = h.rooms.create(h.ref('bob'), DEFAULT_ROOM_SETTINGS);
    expect(h.rooms.getRoomOf('bob')).toBe(other);

    h.act('alice', 'fold');
    expect(h.game().result?.wonByFold).toBe(true);
    expect(h.room.seats[1]?.leaving).toBe(true); // still there for the results
    h.clock.advance(TIMINGS.foldWinPauseMs);
    expect(h.room.seats[1]).toBeNull();
    expect(h.game().players.map((p) => p.seat)).toEqual([0, 2]);
    expect(h.rooms.getRoomOf('bob')).toBe(other);
  });

  it('passes the turn on when the player to act leaves, and host moves to the next member', () => {
    const h = table(['alice', 'bob', 'carol']);
    h.start();
    h.rooms.leave('alice');
    expect(h.game().toActSeat).toBe(1);
    expect(h.room.hostId).toBe('bob');
  });

  it('keeps an all-in player who leaves in the hand; their winnings leave with them', () => {
    const h = table(['alice', 'bob', 'carol'], {
      hands: { 1: { hole: { 0: ['Ah', 'Ad'], 2: ['Kc', 'Kd'] }, board: ['2c', '7d', '9h', 'Js', '3s'] } },
    });
    h.start();
    h.act('alice', 'allIn');
    h.act('bob', 'fold');
    h.act('carol', 'call');
    h.rooms.leave('alice');
    expect(h.game('bob').players[0]?.status).toBe('allIn');

    for (let i = 0; i < 3; i++) h.clock.advance(TIMINGS.runOutDelayMs);
    expect(h.game().result?.pots[0]?.winners).toEqual([{ seat: 0, playerId: 'alice', amount: 2005 }]);

    h.clock.advance(TIMINGS.showdownPauseMs);
    expect(h.room.seats[0]).toBeNull();
    // Bob has chips and Carol is busted, so the table waits.
    expect(h.seatStacks()).toEqual([null, 995, 0, null, null]);
    expect(h.room.table?.tableView().waitingForPlayers).toBe(true);
  });

  it('gives the seat and chips back to a player who returns during the same hand', () => {
    const h = table(['alice', 'bob', 'carol']);
    h.start();
    h.rooms.leave('bob');
    h.join('bob');
    expect(h.rooms.getRoomOf('bob')).toBe(h.room);
    expect(h.room.seats[1]).toMatchObject({ playerId: 'bob', leaving: false, stack: 1000 });
    expect(h.game().players[1]?.status).toBe('folded'); // the fold stands

    h.act('alice', 'fold');
    h.clock.advance(TIMINGS.foldWinPauseMs);
    expect(h.game().players.map((p) => p.playerId)).toEqual(['alice', 'bob', 'carol']);
  });

  it('stops the game and empties the room when the last member leaves', () => {
    const h = table(['alice', 'bob']);
    h.start();
    h.rooms.leave('alice');
    expect(h.game().result?.wonByFold).toBe(true);
    h.rooms.leave('bob');

    expect(h.room).toMatchObject({ status: 'waiting', table: null });
    expect(h.room.seats.every((s) => s === null)).toBe(true);
    h.clock.advance(TIMINGS.emptyRoomTtlMs);
    expect(h.deleted).toEqual([h.room.code]);
    expect(h.clock.pendingTimers).toBe(0);
  });
});

describe('disconnects (R-9.2, R-9.3)', () => {
  it('keeps a disconnected player seated and times out their turns; after 3 missed hands they are removed', () => {
    const h = table(['alice', 'bob', 'carol']);
    h.start();
    h.rooms.setConnected('alice', false); // the host, during hand 1
    expect(h.snapshot('bob').room.seats[0]).toMatchObject({ playerId: 'alice', connected: false });

    const dealtIn: number[] = [];
    for (let i = 0; i < 5; i++) {
      if (h.game().players.some((p) => p.playerId === 'alice')) dealtIn.push(h.game().handId);
      playOut(h);
      h.clock.runNext(); // results pause, then the next hand
    }
    // Hands 2, 3 and 4 started while she was away; she is gone before hand 5.
    expect(dealtIn).toEqual([1, 2, 3, 4]);
    expect(h.room.seats[0]).toBeNull();
    expect(h.rooms.getRoomOf('alice')).toBeUndefined();
    expect(h.room.hostId).toBe('bob');
  });

  it('reconnecting resets the count', () => {
    const h = table(['alice', 'bob', 'carol']);
    h.start();
    h.rooms.setConnected('alice', false);
    const dealtIn: number[] = [];
    for (let i = 0; i < 5; i++) {
      if (h.game().players.some((p) => p.playerId === 'alice')) dealtIn.push(h.game().handId);
      if (h.game().handId === 3) {
        h.rooms.setConnected('alice', true); // back for a moment during hand 3...
        h.rooms.setConnected('alice', false); // ...then gone again
      }
      playOut(h);
      h.clock.runNext();
    }
    // Without the reset she would have been gone before hand 5.
    expect(dealtIn).toEqual([1, 2, 3, 4, 5]);
    expect(h.game().handId).toBe(6);
    expect(h.room.seats[0]?.missedHands).toBe(3); // hands 4, 5 and 6
    playOut(h);
    h.clock.runNext();
    expect(h.room.seats[0]).toBeNull();
  });

  it('restores the full view when a player reconnects mid-hand', () => {
    const h = table(['alice', 'bob', 'carol']);
    h.start();
    const before = h.game('alice');
    h.rooms.setConnected('alice', false);
    h.rooms.setConnected('alice', true);
    const after = h.snapshot('alice');
    expect(after.game?.players[0]?.holeCards).toEqual(before.players[0]?.holeCards);
    expect(after.game?.legalActions).toEqual(before.legalActions);
    expect(after.room.seats[0]?.connected).toBe(true);
  });
});

describe('shutdown', () => {
  it('dispose stops every table timer', () => {
    const h = table(['alice', 'bob']);
    h.start();
    expect(h.clock.pendingTimers).toBe(1);
    h.rooms.dispose();
    expect(h.clock.pendingTimers).toBe(0);
  });
});
