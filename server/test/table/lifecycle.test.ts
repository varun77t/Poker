import { DEFAULT_ROOM_SETTINGS, type FinalResult } from '@poker/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { expectDomainError } from '../helpers/errors';
import { TIMINGS, TURN_MS, createTableHarness, type HandCards, type TableHarness } from '../helpers/table';

/**
 * Phase 6: a game from start to finish at the room level: busts, rebuys (R-10.2), game end (R-10.4),
 * the finished screen's results, restart, host migration mid-game, and players leaving and returning.
 * Players are seated alice (0, host), bob (1), carol (2); the first button is on seat 0 unless stated.
 */

let harness: TableHarness | null = null;
function table(...args: Parameters<typeof createTableHarness>): TableHarness {
  harness = createTableHarness(...args);
  return harness;
}
afterEach(() => {
  expect(harness?.errors ?? []).toEqual([]);
  harness = null;
});

const BOARD = ['2c', '7d', '9h', 'Js', '3s'] as HandCards['board'];
/** Seat 0 holds aces, seat 1 kings, seat 2 queens: seat 0 wins any showdown on BOARD. */
const ACES_WIN: HandCards = { hole: { 0: ['Ah', 'Ad'], 1: ['Kc', 'Kd'], 2: ['Qc', 'Qd'] }, board: BOARD };
/** Seat 0 aces against seat 2 kings (hand 1 of the three-handed games). */
const ACES_VS_SEAT2: HandCards = { hole: { 0: ['Ah', 'Ad'], 2: ['Kc', 'Kd'] }, board: BOARD };

/** Runs an all-in hand's remaining streets (no decisions left) until its result is up. */
function runOut(h: TableHarness): void {
  for (let guard = 0; guard < 10 && !h.game().result; guard++) {
    if (h.game().toActSeat !== null) throw new Error('runOut: someone still has to act');
    h.clock.runNext();
  }
}

/** Ends the results pause (the next hand is dealt, or the game ends). */
const endPause = (h: TableHarness) => h.clock.advance(TIMINGS.showdownPauseMs);

const line = (playerId: string, finalStack: number, totalBuyIn: number = DEFAULT_ROOM_SETTINGS.startingStack): FinalResult => ({
  playerId,
  displayName: playerId,
  finalStack,
  totalBuyIn,
  rebuys: totalBuyIn / DEFAULT_ROOM_SETTINGS.startingStack - 1,
  net: finalStack - totalBuyIn,
});

/**
 * Hand 1, three-handed (button alice, SB bob, BB carol): alice shoves, bob folds, carol calls and
 * loses. Leaves alice 2005, bob 995, carol 0 (busted), with hand 2 dealt to alice and bob.
 */
function bustCarol(h: TableHarness): void {
  h.start();
  h.act('alice', 'allIn');
  h.act('bob', 'fold');
  h.act('carol', 'call');
  runOut(h);
  expect(h.seatStacks()).toEqual([2005, 995, 0, null, null]);
  endPause(h);
  expect(h.game()).toMatchObject({ handId: 2, buttonSeat: 1 });
  expect(h.game().players.map((p) => p.playerId)).toEqual(['alice', 'bob']);
}

describe('a game with rebuys off plays to the last player standing', () => {
  it('ends when only one player has chips, with ranked results that sum to zero', () => {
    const h = table(['alice', 'bob', 'carol'], {
      settings: { rebuys: false },
      hands: { 1: ACES_VS_SEAT2, 2: { hole: { 0: ['As', 'Ac'], 1: ['Kh', 'Ks'] }, board: ['2d', '7c', '9s', 'Jd', '3h'] } },
    });
    bustCarol(h);
    // Busted with rebuys off: carol watches (R-10.1) and cannot buy back in.
    expect(h.snapshot('carol').room.seats[2]).toMatchObject({ stack: 0, busted: true });
    expectDomainError(() => h.rooms.rebuy('carol'), 'REBUY_NOT_ALLOWED');

    // Hand 2, heads-up: bob (button, small blind) shoves and loses.
    h.act('bob', 'allIn');
    h.act('alice', 'call');
    runOut(h);
    expect(h.room.status).toBe('playing'); // the result is shown first
    expect(h.snapshot('alice').room.finalResults).toBeNull();
    endPause(h);

    expect(h.room.status).toBe('finished');
    expect(h.room.table).toBeNull();
    const snap = h.snapshot('carol');
    expect(snap.game).toBeNull();
    expect(snap.room.table).toBeNull();
    expect(snap.room.finalResults).toEqual([line('alice', 3000), line('bob', 0), line('carol', 0)]);
    // Everyone stays seated on the finished screen; nothing is left running.
    expect(snap.room.seats.map((s) => s?.playerId ?? null)).toEqual(['alice', 'bob', 'carol', null, null]);
    expect(h.clock.pendingTimers).toBe(0);
  });

  it('ends straight after a hand where everyone was all-in and one player took it all', () => {
    const h = table(['alice', 'bob', 'carol'], { settings: { rebuys: false }, hands: { 1: ACES_WIN } });
    h.start();
    h.act('alice', 'allIn');
    h.act('bob', 'call');
    h.act('carol', 'call');
    runOut(h);
    expect(h.game().result?.pots).toEqual([
      { amount: 3000, eligibleSeats: [0, 1, 2], winners: [{ seat: 0, playerId: 'alice', amount: 3000 }] },
    ]);
    endPause(h);
    expect(h.room.status).toBe('finished');
    expect(h.room.finalResults).toEqual([line('alice', 3000), line('bob', 0), line('carol', 0)]);
  });

  it('carries on after a split pot: nobody busted', () => {
    const h = table(['alice', 'bob'], {
      settings: { rebuys: false },
      hands: { 1: { board: ['As', 'Ks', 'Qs', 'Js', 'Ts'] } }, // the board plays for both (R-8.4)
    });
    h.start();
    h.act('alice', 'allIn');
    h.act('bob', 'call');
    runOut(h);
    expect(h.game().result?.pots[0]?.winners.map((w) => w.amount)).toEqual([1000, 1000]);
    endPause(h);
    expect(h.room.status).toBe('playing');
    expect(h.game().handId).toBe(2);
  });
});

describe('everyone folds to one player', () => {
  it('pays the last player in and deals the next hand after the short pause', () => {
    const h = table(['alice', 'bob', 'carol']);
    h.start();
    h.act('alice', 'fold');
    h.act('bob', 'fold');
    expect(h.game().result).toMatchObject({ wonByFold: true, shown: [] });
    expect(h.seatStacks()).toEqual([1000, 995, 1005, null, null]);
    h.clock.advance(TIMINGS.foldWinPauseMs - 1);
    expect(h.game().handId).toBe(1);
    h.clock.advance(1);
    expect(h.game()).toMatchObject({ handId: 2, buttonSeat: 1 });
  });
});

describe('rebuys (R-10.2)', () => {
  it('a busted player sitting out rebuys during a hand and is dealt in from the next one', () => {
    const h = table(['alice', 'bob', 'carol'], { hands: { 1: ACES_VS_SEAT2 } });
    bustCarol(h);
    const version = h.room.version;

    // Not allowed for players in the live hand, or with chips.
    expectDomainError(() => h.rooms.rebuy('alice'), 'REBUY_NOT_ALLOWED');
    expectDomainError(() => h.rooms.rebuy('bob'), 'REBUY_NOT_ALLOWED');

    h.rooms.rebuy('carol');
    expect(h.room.version).toBe(version + 1);
    expect(h.room.seats[2]).toMatchObject({ stack: 1000, totalBuyIn: 2000 });
    expect(h.snapshot('carol').room.seats[2]).toMatchObject({ stack: 1000, busted: false });
    expect(h.game().players.map((p) => p.playerId)).toEqual(['alice', 'bob']); // this hand goes on without her
    expectDomainError(() => h.rooms.rebuy('carol'), 'REBUY_NOT_ALLOWED'); // she has chips now

    h.act('bob', 'fold');
    h.clock.advance(TIMINGS.foldWinPauseMs);
    expect(h.game().players.map((p) => p.playerId)).toEqual(['alice', 'bob', 'carol']);
  });

  it('a heads-up table waits for a rebuy, then deals at once', () => {
    const h = table(['alice', 'bob'], { hands: { 1: ACES_WIN } });
    h.start();
    h.act('alice', 'allIn');
    h.act('bob', 'call');
    // Both are all-in in a hand still being played: no rebuys yet, and the message says why.
    expectDomainError(() => h.rooms.rebuy('bob'), 'REBUY_NOT_ALLOWED');
    expect(() => h.rooms.rebuy('bob')).toThrow('once this hand is over');
    runOut(h);
    endPause(h);

    expect(h.snapshot('bob').room.table).toEqual({ nextHandAt: null, waitingForPlayers: true, endingAfterHand: false });
    expect(h.room.status).toBe('playing'); // rebuys on: the table waits instead of ending (R-10.4)
    expectDomainError(() => h.rooms.rebuy('alice'), 'REBUY_NOT_ALLOWED');

    h.rooms.rebuy('bob');
    expect(h.game()).toMatchObject({ handId: 2 });
    expect(h.game().players.map((p) => [p.playerId, p.stack + p.committed])).toEqual([
      ['alice', 2000],
      ['bob', 1000],
    ]);
    expect(h.snapshot('bob').room.table?.waitingForPlayers).toBe(false);
  });

  it('rebuying during the results of the hand you busted in keeps the game going without a wait', () => {
    const h = table(['alice', 'bob'], { hands: { 1: ACES_WIN } });
    h.start();
    h.act('alice', 'allIn');
    h.act('bob', 'call');
    runOut(h);
    expect(h.snapshot('bob').room.seats[1]).toMatchObject({ stack: 0, busted: true });
    h.rooms.rebuy('bob');
    expect(h.game().handId).toBe(1); // still showing the result
    endPause(h);
    expect(h.game().handId).toBe(2);
  });

  it('is refused outside a running game', () => {
    const h = table(['alice', 'bob']);
    expectDomainError(() => h.rooms.rebuy('bob'), 'INVALID_STATE');
    expectDomainError(() => h.rooms.rebuy('nobody'), 'NOT_IN_ROOM');
  });
});

describe('the host ends the game (R-10.4)', () => {
  it('mid-hand: the hand is played out and its result shown, then the game ends', () => {
    const h = table(['alice', 'bob', 'carol']);
    h.start();
    expectDomainError(() => h.rooms.endGame('bob'), 'NOT_HOST');

    h.rooms.endGame('alice');
    expect(h.snapshot('bob').room.table?.endingAfterHand).toBe(true);
    const version = h.room.version;
    h.rooms.endGame('alice'); // asking twice changes nothing
    expect(h.room.version).toBe(version);

    h.act('alice', 'fold');
    h.act('bob', 'fold');
    expect(h.room.status).toBe('playing');
    expect(h.game().result).not.toBeNull();
    h.clock.advance(TIMINGS.foldWinPauseMs);

    expect(h.room.status).toBe('finished');
    expect(h.room.finalResults).toEqual([line('carol', 1005), line('alice', 1000), line('bob', 995)]);
    expectDomainError(() => h.rooms.endGame('alice'), 'INVALID_STATE');
  });

  it('while the table waits for players: the game ends at once', () => {
    const h = table(['alice', 'bob'], { hands: { 1: ACES_WIN } });
    h.start();
    h.act('alice', 'allIn');
    h.act('bob', 'call');
    runOut(h);
    endPause(h);
    expect(h.room.table?.tableView().waitingForPlayers).toBe(true);

    h.rooms.endGame('alice');
    expect(h.room.status).toBe('finished');
    expect(h.room.finalResults).toEqual([line('alice', 2000), line('bob', 0)]);
    expect(h.clock.pendingTimers).toBe(0);
  });

  it('counts rebuys in the results', () => {
    const h = table(['alice', 'bob'], { hands: { 1: ACES_WIN } });
    h.start();
    h.act('alice', 'allIn');
    h.act('bob', 'call');
    runOut(h);
    h.rooms.rebuy('bob');
    h.rooms.endGame('alice');
    endPause(h);
    expect(h.room.finalResults).toEqual([line('alice', 2000), line('bob', 1000, 2000)]);
    expect(h.room.finalResults?.[1]).toMatchObject({ rebuys: 1, net: -1000 });
  });
});

describe('restart', () => {
  it('the host restarts from the finished screen with fresh stacks and new settings', () => {
    const h = table(['alice', 'bob', 'carol'], { settings: { rebuys: false }, hands: { 1: ACES_WIN } });
    h.start();
    h.act('alice', 'allIn');
    h.act('bob', 'call');
    h.act('carol', 'call');
    runOut(h);
    endPause(h);
    expect(h.room.status).toBe('finished');

    expectDomainError(() => h.rooms.start('bob'), 'NOT_HOST');
    const bigger = { ...DEFAULT_ROOM_SETTINGS, startingStack: 2000, rebuys: false };
    h.rooms.updateSettings('alice', bigger); // allowed on the finished screen; applies on restart
    expect(h.room.seats.map((s) => s?.stack ?? null)).toEqual([3000, 0, 0, null, null]);

    h.start(1);
    expect(h.room.status).toBe('playing');
    expect(h.room.finalResults).toBeNull();
    expect(h.game()).toMatchObject({ handId: 2, buttonSeat: 1 }); // hand ids keep counting (stale actions can't match)
    expect(h.game().players.map((p) => [p.playerId, p.stack + p.committed])).toEqual([
      ['alice', 2000],
      ['bob', 2000],
      ['carol', 2000],
    ]);
    expect(h.room.seats.map((s) => s?.totalBuyIn ?? null)).toEqual([2000, 2000, 2000, null, null]);
  });

  it('needs two players: a finished room others left cannot restart until someone joins', () => {
    const h = table(['alice', 'bob'], { settings: { rebuys: false }, hands: { 1: ACES_WIN } });
    h.start();
    h.act('alice', 'allIn');
    h.act('bob', 'call');
    runOut(h);
    endPause(h);
    h.rooms.leave('bob');
    expect(h.room.finalResults).toEqual([line('alice', 2000), line('bob', 0)]); // the record stays
    expectDomainError(() => h.rooms.start('alice'), 'NOT_ENOUGH_PLAYERS');

    h.join('dave'); // anyone can join the finished room and play the next game
    expect(h.snapshot('dave').room).toMatchObject({ status: 'finished', finalResults: h.room.finalResults });
    h.start(0);
    expect(h.game().players.map((p) => p.playerId)).toEqual(['alice', 'dave']);
  });
});

describe('host migration mid-game', () => {
  it('the host leaving mid-hand hands over at once; the new host can end the game', () => {
    const h = table(['alice', 'bob', 'carol']);
    h.start();
    h.join('dave'); // late joiner: waits for the next hand
    h.rooms.leave('alice');
    expect(h.room.hostId).toBe('bob');
    expect(h.snapshot('bob').room.hostId).toBe('bob');
    expectDomainError(() => h.rooms.endGame('alice'), 'NOT_IN_ROOM');

    h.rooms.endGame('bob');
    h.act('bob', 'fold');
    h.clock.advance(TIMINGS.foldWinPauseMs);
    expect(h.room.status).toBe('finished');
    // Alice played and left: she is in the results. Dave never played: he isn't, but he is still seated.
    expect(h.room.finalResults).toEqual([line('carol', 1005), line('alice', 1000), line('bob', 995)]);
    expect(h.room.seats.map((s) => s?.playerId ?? null)).toEqual([null, 'bob', 'carol', 'dave', null]);
  });
});

describe('leaving and coming back during a game (no fresh stack)', () => {
  it('a busted player who leaves and rejoins is still busted', () => {
    const h = table(['alice', 'bob', 'carol'], { settings: { rebuys: false }, hands: { 1: ACES_VS_SEAT2 } });
    bustCarol(h);
    h.rooms.leave('carol'); // not in hand 2, so the seat is freed straight away
    expect(h.room.seats[2]).toBeNull();

    h.join('carol');
    expect(h.room.seats[2]).toMatchObject({ playerId: 'carol', stack: 0, totalBuyIn: 1000 });
    expect(h.snapshot('carol').room.seats[2]).toMatchObject({ busted: true });
    expectDomainError(() => h.rooms.rebuy('carol'), 'REBUY_NOT_ALLOWED');
    h.act('bob', 'fold');
    h.clock.advance(TIMINGS.foldWinPauseMs);
    expect(h.game().players.map((p) => p.playerId)).toEqual(['alice', 'bob']);
  });

  it('a player who leaves mid-hand comes back with the chips they had when the hand ended', () => {
    const h = table(['alice', 'bob', 'carol']);
    h.start();
    h.act('alice', 'fold');
    h.act('bob', 'fold'); // bob loses his small blind: 995
    h.clock.advance(TIMINGS.foldWinPauseMs);
    // Hand 2: button bob, SB carol, BB alice; bob is first to act and leaves instead.
    h.rooms.leave('bob');
    expect(h.room.seats[1]).toMatchObject({ leaving: true });
    h.act('carol', 'fold');
    h.clock.advance(TIMINGS.foldWinPauseMs);
    expect(h.room.seats[1]).toBeNull();

    h.join('bob');
    expect(h.room.seats[1]).toMatchObject({ playerId: 'bob', stack: 995, totalBuyIn: 1000, waitingForNextHand: true });
  });

  it('someone who never played gets a fresh stack, and the memory ends with the game', () => {
    const h = table(['alice', 'bob'], { settings: { rebuys: false }, hands: { 1: ACES_WIN } });
    h.start();
    h.join('carol');
    h.rooms.leave('carol'); // never dealt in: nothing to remember
    h.join('carol');
    expect(h.room.seats[2]).toMatchObject({ stack: 1000, totalBuyIn: 1000 });
    expect(h.room.departed.size).toBe(0);

    h.act('alice', 'allIn');
    h.act('bob', 'call');
    runOut(h);
    endPause(h);
    // Rebuys off and two players still have chips (alice, carol): the game goes on without bob.
    expect(h.game().players.map((p) => p.playerId)).toEqual(['alice', 'carol']);
    h.rooms.leave('bob');
    expect(h.room.departed.get('bob')).toEqual({ displayName: 'bob', stack: 0, totalBuyIn: 1000 });
    h.rooms.endGame('alice');
    h.act(h.toAct(), 'fold');
    h.clock.advance(TIMINGS.foldWinPauseMs);
    expect(h.room.status).toBe('finished');
    expect(h.room.departed.size).toBe(0);
    expect(h.room.finalResults?.map((r) => r.playerId)).toEqual(['alice', 'carol', 'bob']);
    expect(h.room.finalResults?.reduce((acc, r) => acc + r.net, 0)).toBe(0);

    h.join('bob'); // after the game: an ordinary newcomer
    expect(h.room.seats[1]).toMatchObject({ stack: 1000 });
  });
});

describe('disconnects around the end of a game', () => {
  it('a player disconnected when the game ends loses the seat after the grace window, keeping their result', () => {
    const h = table(['alice', 'bob', 'carol'], { settings: { rebuys: false }, hands: { 1: ACES_WIN } });
    h.start();
    h.rooms.setConnected('carol', false);
    h.act('alice', 'allIn');
    h.act('bob', 'call');
    h.clock.advance(TURN_MS); // carol's turn times out: she folds (R-9.2)
    expect(h.game().players[2]?.status).toBe('folded');
    runOut(h);
    endPause(h); // bob busted: carol still has chips, so the game goes on
    expect(h.game().players.map((p) => p.playerId)).toEqual(['alice', 'carol']);
    h.rooms.endGame('alice');
    h.clock.advance(TURN_MS); // whoever is to act: alice is connected but idle, carol is away
    for (let i = 0; i < 5 && h.room.status === 'playing'; i++) h.clock.runNext();
    expect(h.room.status).toBe('finished');

    h.clock.advance(TIMINGS.lobbyDisconnectGraceMs - 1);
    expect(h.room.seats[2]?.playerId).toBe('carol');
    h.clock.advance(1);
    expect(h.room.seats[2]).toBeNull();
    expect(h.room.finalResults?.some((r) => r.playerId === 'carol')).toBe(true);
  });

  it('disconnecting on the finished screen also releases the seat after the grace window', () => {
    const h = table(['alice', 'bob', 'carol']);
    h.start();
    h.rooms.endGame('alice');
    for (let i = 0; i < 10 && h.room.status === 'playing'; i++) h.clock.runNext();
    expect(h.room.status).toBe('finished');
    h.rooms.setConnected('bob', false);
    h.clock.advance(TIMINGS.lobbyDisconnectGraceMs);
    expect(h.room.seats.map((s) => s?.playerId ?? null)).toEqual(['alice', null, 'carol', null, null]);
  });

  it('coming back within the grace window keeps the seat for the restart', () => {
    const h = table(['alice', 'bob']);
    h.start();
    h.rooms.setConnected('bob', false);
    h.rooms.endGame('alice');
    for (let i = 0; i < 10 && h.room.status === 'playing'; i++) h.clock.runNext();
    expect(h.room.status).toBe('finished');
    h.clock.advance(TIMINGS.lobbyDisconnectGraceMs / 2);
    h.rooms.setConnected('bob', true);
    h.clock.advance(TIMINGS.lobbyDisconnectGraceMs);
    expect(h.room.seats[1]?.playerId).toBe('bob');
    h.start(0);
    expect(h.game().players.map((p) => p.playerId)).toEqual(['alice', 'bob']);
  });
});
