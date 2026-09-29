import { DEFAULT_ROOM_SETTINGS } from '@poker/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { toRoomView } from '../../src/rooms/room';
import { expectDomainError } from '../helpers/errors';
import { TIMINGS, TURN_MS, createTableHarness, type HandCards, type TableHarness } from '../helpers/table';

/**
 * Phase 7: bots in a room (product-spec §3.7, game-rules R-10.6). Players are seated in the order
 * given (the first is host); bots take the lowest open seats. People who have to act in these tests
 * mostly let their turn timer run out (check, else fold), so hands move along on their own.
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

const START = DEFAULT_ROOM_SETTINGS.startingStack;
const handId = (h: TableHarness) => h.room.table?.gameView('x')?.handId ?? null;

/** Runs timers (bot turns, turn timeouts, streets, pauses) until `done` or the guard runs out. */
function runUntil(h: TableHarness, done: () => boolean, guard = 500): void {
  for (let i = 0; i < guard && !done(); i++) if (!h.clock.runNext()) break;
  if (!done()) throw new Error('condition never met');
}
const handOver = (h: TableHarness) => () => !!h.room.table?.gameView('x')?.result;
const handDealt = (h: TableHarness, id: number) => () => (handId(h) ?? 0) >= id && !h.room.table?.gameView('x')?.result;

describe('adding and removing bots', () => {
  it('lets only the host add and remove bots, names them uniquely, and refuses a full table', () => {
    const h = table(['alice', 'bob']);
    expectDomainError(() => h.rooms.addBot('bob', 'easy'), 'NOT_HOST');
    expect(h.rooms.addBot('alice', 'easy')).toBe(2);
    expect(h.rooms.addBot('alice', 'normal')).toBe(3);
    expect(h.rooms.addBot('alice', 'normal')).toBe(4);
    expectDomainError(() => h.rooms.addBot('alice', 'easy'), 'ROOM_FULL');
    expectDomainError(() => h.join('carol'), 'ROOM_FULL'); // bots take real seats

    const seats = toRoomView(h.room, 'bob').seats;
    expect(seats.map((s) => s && [s.displayName, s.isBot, s.botLevel])).toEqual([
      ['alice', false, null],
      ['bob', false, null],
      ['Ace Bot', true, 'easy'],
      ['King Bot', true, 'normal'],
      ['Queen Bot', true, 'normal'],
    ]);

    expectDomainError(() => h.rooms.removeBot('bob', 3), 'NOT_HOST');
    expectDomainError(() => h.rooms.removeBot('alice', 1), 'INVALID_STATE'); // a person, not a bot
    h.rooms.removeBot('alice', 3);
    expect(h.room.seats[3]).toBeNull();
    expectDomainError(() => h.rooms.removeBot('alice', 3), 'INVALID_STATE'); // already gone
    h.rooms.addBot('alice', 'easy');
    expect(h.room.seats[3]).toMatchObject({ displayName: 'King Bot', bot: 'easy' }); // the free name again
  });

  it('seats a bot in the open seat the host picked, and refuses a taken one', () => {
    const h = table(['alice', 'bob']);
    expect(h.rooms.addBot('alice', 'normal', 4)).toBe(4); // not the lowest open seat (2)
    expect(h.room.seats[4]).toMatchObject({ bot: 'normal' });
    expect(h.room.seats[2]).toBeNull();
    expectDomainError(() => h.rooms.addBot('alice', 'easy', 1), 'INVALID_STATE'); // bob's
    expectDomainError(() => h.rooms.addBot('alice', 'easy', 4), 'INVALID_STATE'); // the bot's
    expect(h.rooms.addBot('alice', 'easy')).toBe(2);
  });

  it('seats bots at creation ("Play against bots") with fresh stacks, and never indexes them as players', () => {
    const h = table(['alice']);
    const room = h.rooms.create(h.ref('dana'), { ...DEFAULT_ROOM_SETTINGS }, ['normal', 'normal', 'normal']);
    expect(room.hostId).toBe('dana');
    expect(room.seats.map((s) => s?.bot ?? null)).toEqual([null, 'normal', 'normal', 'normal', null]);
    expect(room.seats.slice(1, 4).every((s) => s?.stack === START && s.connected)).toBe(true);
    for (const seat of room.seats.slice(1, 4)) expect(h.rooms.getRoomOf(seat!.playerId)).toBeUndefined();
  });

  it('never makes a bot host, and the last person to leave takes the bots along', () => {
    const h = table(['alice']);
    h.rooms.addBot('alice', 'normal'); // seat 1, right after the host
    h.join('bob'); // seat 2
    h.rooms.leave('alice');
    expect(h.room.hostId).toBe('bob'); // skipped the bot
    h.rooms.leave('bob');
    expect(h.room.seats.every((s) => s === null)).toBe(true);
    expect(h.room.status).toBe('waiting');
    h.clock.advance(TIMINGS.emptyRoomTtlMs);
    expect(h.deleted).toEqual([h.room.code]);
  });

  it('takes the bots along when the last person leaves in the middle of a hand', () => {
    const h = table(['alice']);
    h.rooms.addBot('alice', 'normal');
    h.rooms.addBot('alice', 'easy');
    h.start();
    h.rooms.leave('alice');
    expect(h.room.seats.every((s) => s === null)).toBe(true);
    expect(h.room.table).toBeNull();
    expect(h.clock.pendingTimers).toBe(1); // only the empty-room TTL: no bot keeps playing
  });

  it('deals a bot added during a game in from the next hand, like a late joiner', () => {
    const h = table(['alice', 'bob']);
    h.start();
    const seat = h.rooms.addBot('alice', 'easy');
    expect(h.room.seats[seat]).toMatchObject({ waitingForNextHand: true });
    expect(h.game().players.map((p) => p.seat)).toEqual([0, 1]);
    h.act(h.toAct(), 'fold');
    runUntil(h, handDealt(h, 2));
    expect(h.game().players.map((p) => p.seat)).toEqual([0, 1, seat]);
  });

  it('folds a bot removed mid-hand at once and frees its seat after the hand', () => {
    const h = table(['alice', 'bob']);
    h.rooms.addBot('alice', 'normal'); // seat 2
    h.start(); // three-handed, button on seat 0: the bot is the big blind
    h.rooms.removeBot('alice', 2);
    expect(h.game().players.find((p) => p.seat === 2)?.status).toBe('folded');
    expect(h.room.seats[2]).toMatchObject({ leaving: true });
    expectDomainError(() => h.rooms.removeBot('alice', 2), 'INVALID_STATE');
    runUntil(h, handOver(h));
    runUntil(h, handDealt(h, 2));
    expect(h.room.seats[2]).toBeNull();
    expect(h.game().players.map((p) => p.seat)).toEqual([0, 1]);
  });
});

describe('bots at the table', () => {
  it('lets one person play one bot; the bot thinks for a moment, then acts through the same checks', () => {
    const h = table(['alice']);
    h.rooms.addBot('alice', 'normal'); // seat 1
    h.start(); // heads-up, button (small blind) on seat 0: alice acts first
    expect(h.toAct()).toBe('alice');
    expect(h.room.table?.pendingTimer).toBe('turn');
    h.act('alice', 'call');
    // The bot's turn: a think timer, not the 30 s turn timer.
    expect(h.toAct()).toMatch(/^bot:/);
    expect(h.room.table?.pendingTimer).toBe('bot');
    const wait = h.clock.nextTimerIn ?? 0;
    expect(wait).toBeGreaterThanOrEqual(TIMINGS.botThinkMinMs);
    expect(wait).toBeLessThanOrEqual(TIMINGS.botThinkMaxMs);
    const { seq } = h.game();
    h.clock.advance(wait - 1);
    expect(h.game().seq).toBe(seq); // still thinking
    h.clock.advance(1);
    expect(h.game().seq).toBeGreaterThan(seq);
    expect(h.game().players.find((p) => p.seat === 1)?.lastAction).not.toBeNull();
    // Someone acting for the bot with the old seq is stale, like any replay.
    expectDomainError(() => h.rooms.act('alice', { handId: h.game().handId, seq, type: 'check' }), 'STALE_ACTION');
  });

  it('decides from its own view only: other hole cards never change what it does', () => {
    // Same seed, same button; the only difference is alice's hole cards (and so the rest of the deck).
    const firstBotAction = (alice: HandCards['hole']) => {
      const h = createTableHarness(['alice'], { seed: 5, hands: { 1: { hole: { ...alice, 1: ['Qh', 'Js'] } } } });
      h.rooms.addBot('alice', 'normal');
      h.start();
      h.act('alice', 'call');
      h.clock.runNext();
      return h.game().players.find((p) => p.seat === 1)?.lastAction;
    };
    const a = firstBotAction({ 0: ['As', 'Ad'] });
    const b = firstBotAction({ 0: ['7c', '2d'] });
    expect(a).not.toBeNull();
    expect(b).toEqual(a);
  });

  it('rebuys a busted bot before the next hand when rebuys are on', () => {
    const h = table(['alice'], { hands: { 2: { hole: { 0: ['As', 'Ad'], 1: ['7d', '2c'] }, board: ['Kc', '9h', '4s', '3d', 'Jc'] } } });
    h.rooms.addBot('alice', 'normal'); // seat 1
    h.start();
    runUntil(h, handOver(h));
    // Between hands, leave the bot just its small blind (hand 2's button, heads-up) so posting it is all-in.
    const bot = h.room.seats[1]!;
    const alice = h.room.seats[0]!;
    alice.stack += bot.stack - 5;
    bot.stack = 5;
    runUntil(h, handDealt(h, 2), 5);
    expect(h.game().buttonSeat).toBe(1);
    expect(h.game().players.find((p) => p.seat === 1)?.status).toBe('allIn');
    runUntil(h, handOver(h)); // alice's big blind closes the action; aces hold
    expect(h.room.seats[1]?.stack).toBe(0);
    expect(toRoomView(h.room, 'alice').seats[1]?.busted).toBe(true); // "Out of chips" during the results
    runUntil(h, handDealt(h, 3));
    expect(h.room.seats[1]).toMatchObject({ stack: expect.any(Number), totalBuyIn: 2 * START });
    expect(h.game().players.map((p) => p.seat)).toEqual([0, 1]);
  });

  it('lets a busted bot leave when rebuys are off (it keeps its line in the results)', () => {
    const h = table(['alice', 'bob'], {
      settings: { rebuys: false },
      hands: { 2: { hole: { 0: ['As', 'Ad'], 1: ['Kc', 'Kd'], 2: ['7d', '2c'] }, board: ['Qc', '9h', '4s', '3d', 'Jc'] } },
    });
    h.rooms.addBot('alice', 'normal'); // seat 2
    h.start();
    runUntil(h, handOver(h));
    // Hand 2 (button 1): the bot on seat 2 is the small blind; leave it just that.
    const bot = h.room.seats[2]!;
    h.room.seats[0]!.stack += bot.stack - 5;
    bot.stack = 5;
    runUntil(h, handDealt(h, 2), 5);
    runUntil(h, handOver(h));
    expect(h.room.seats[2]?.stack).toBe(0);
    runUntil(h, handDealt(h, 3));
    expect(h.room.seats[2]).toBeNull();
    expect(h.room.departed.get(bot.playerId)).toMatchObject({ displayName: 'Ace Bot', stack: 0, botLevel: 'normal' });
    h.rooms.endGame('alice');
    runUntil(h, () => h.room.status === 'finished');
    expect(h.room.finalResults?.find((r) => r.playerId === bot.playerId)).toMatchObject({ finalStack: 0, net: -START, botLevel: 'normal' });
  });

  it('pauses while no person with chips is here, and deals again when they come back (R-10.6)', () => {
    const h = table(['alice']);
    h.rooms.addBot('alice', 'normal');
    h.rooms.addBot('alice', 'easy');
    h.start();
    h.rooms.setConnected('alice', false);
    runUntil(h, handOver(h), 50);
    h.clock.advance(TIMINGS.showdownPauseMs);
    expect(h.room.table?.tableView().waitingForPlayers).toBe(true);
    expect(h.room.table?.gameView('alice')).toBeNull();
    expect(h.room.table?.pendingTimer).toBeNull();
    h.clock.advance(10 * TURN_MS); // the bots don't play on their own
    expect(h.room.table?.gameView('alice')).toBeNull();
    expect(h.room.seats[0]).not.toBeNull(); // no hands, so no missed hands (R-9.3) either

    h.rooms.setConnected('alice', true);
    expect(h.room.table?.tableView().waitingForPlayers).toBe(false);
    expect(h.game().players.map((p) => p.seat)).toEqual([0, 1, 2]);
  });

  it('with rebuys off, ends a paused game once the only person with chips leaves', () => {
    const h = table(['alice', 'bob'], { settings: { rebuys: false } });
    h.rooms.addBot('alice', 'normal');
    h.start();
    runUntil(h, handOver(h));
    // Alice busts (her chips go to the bot); bob, the only person with chips, drops out.
    const alice = h.room.seats[0]!;
    h.room.seats[2]!.stack += alice.stack;
    alice.stack = 0;
    h.rooms.setConnected('bob', false);
    h.clock.advance(TIMINGS.showdownPauseMs);
    expect(h.room.table?.tableView().waitingForPlayers).toBe(true); // bob has chips but isn't here (R-10.6)
    h.rooms.leave('bob');
    expect(h.room.status).toBe('finished'); // nobody can ever play on
  });

  it('with rebuys on, waits for a busted person to rebuy rather than let the bots play alone', () => {
    const h = table(['alice']);
    h.rooms.addBot('alice', 'normal');
    h.rooms.addBot('alice', 'normal');
    h.start();
    runUntil(h, handOver(h));
    // Alice goes broke in hand 1 (her chips move to a bot, so none are lost).
    const alice = h.room.seats[0]!;
    h.room.seats[1]!.stack += alice.stack;
    alice.stack = 0;
    runUntil(h, () => !!h.room.table?.tableView().waitingForPlayers, 5);
    expect(h.room.table?.gameView('alice')).toBeNull();
    h.clock.advance(10 * TURN_MS);
    expect(h.room.table?.gameView('alice')).toBeNull();
    h.rooms.rebuy('alice');
    expect(h.game().players.map((p) => p.seat)).toEqual([0, 1, 2]);
  });

  it('with rebuys off, ends the game once no person has chips, even though the bots do', () => {
    const h = table(['alice'], { settings: { rebuys: false } });
    h.rooms.addBot('alice', 'normal');
    h.rooms.addBot('alice', 'easy');
    h.start();
    runUntil(h, handOver(h));
    const alice = h.room.seats[0]!;
    h.room.seats[1]!.stack += alice.stack;
    alice.stack = 0;
    h.clock.advance(TIMINGS.showdownPauseMs);
    expect(h.room.status).toBe('finished');
    expect(h.room.finalResults?.map((r) => [r.displayName, r.botLevel])).toEqual([
      ['Ace Bot', 'normal'],
      ['King Bot', 'easy'],
      ['alice', null],
    ]);
    expect(h.room.finalResults?.reduce((sum, r) => sum + r.net, 0)).toBe(0);
  });

  it('restarts with the bots still seated and fresh stacks for everyone', () => {
    const h = table(['alice']);
    h.rooms.addBot('alice', 'easy');
    h.start();
    h.rooms.endGame('alice');
    runUntil(h, () => h.room.status === 'finished');
    h.rooms.start('alice');
    expect(h.room.status).toBe('playing');
    expect(h.room.seats[1]).toMatchObject({ bot: 'easy', totalBuyIn: START });
    expect(h.game().players).toHaveLength(2);
  });

  it('plays a long game of one person and four bots without stalling or losing a chip', () => {
    const h = table(['alice']);
    for (let i = 0; i < 4; i++) h.rooms.addBot('alice', i % 2 ? 'easy' : 'normal');
    h.start();
    const total = () => {
      const seated = h.room.seats.reduce((sum, s) => sum + (s ? s.stack - s.totalBuyIn : 0), 0);
      const gone = [...h.room.departed.values()].reduce((sum, d) => sum + d.stack - d.totalBuyIn, 0);
      return seated + gone;
    };
    for (let hand = 2; hand <= 60; hand++) {
      // Alice calls or checks whatever comes (and rebuys when she busts); the bots do the rest.
      runUntil(
        h,
        () => {
          const g = h.room.table?.gameView('alice');
          if (g?.legalActions) h.act('alice', g.legalActions.canCheck ? 'check' : 'call');
          if (toRoomView(h.room, 'alice').seats[0]?.busted) h.rooms.rebuy('alice');
          return handDealt(h, hand)();
        },
        2000,
      );
      expect(total()).toBe(0);
    }
    expect(handId(h)).toBe(60);
  });
});
