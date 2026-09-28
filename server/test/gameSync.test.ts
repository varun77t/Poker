import {
  DEFAULT_ROOM_SETTINGS,
  type ActionType,
  type Card,
  type GameView,
  type LegalActions,
  type TableSnapshot,
} from '@poker/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TIMINGS } from '../src/policies';
import { controlledRandomInt, seededRandomInt } from './helpers/random';
import { request, startTestServer, type TestPlayer, type TestServer } from './helpers/testServer';

/**
 * Phase 4 end to end: real socket.io-client players against an in-process server, with the fake
 * clock driving turn timers and pacing.
 */

const TURN_MS = DEFAULT_ROOM_SETTINGS.turnSeconds * 1000;
const T = DEFAULT_TIMINGS;

let t: TestServer;
let rng: ReturnType<typeof controlledRandomInt>;

beforeEach(async () => {
  rng = controlledRandomInt(42);
  t = await startTestServer({ randomInt: rng });
});
afterEach(() => t.close());

const gameOf = (s: TableSnapshot | undefined): GameView => {
  if (!s?.game) throw new Error('no game in snapshot');
  return s.game;
};

/** Alice (host, seat 0), Bob (seat 1), Carol (seat 2); the first button is on Alice. */
async function startThreeHanded(): Promise<TestPlayer[]> {
  const players = [await t.player('Alice'), await t.player('Bob'), await t.player('Carol')];
  const [alice, ...others] = players as [TestPlayer, ...TestPlayer[]];
  const created = await request(alice.socket, 'room:create', { settings: DEFAULT_ROOM_SETTINGS });
  if (!created.ok) throw new Error(created.message);
  for (const p of others) expect((await request(p.socket, 'room:join', { code: created.data.code })).ok).toBe(true);
  rng.force(0);
  expect(await request(alice.socket, 'game:start', {})).toEqual({ ok: true, data: {} });
  await Promise.all(players.map((p) => p.stateWhere((s) => s.game?.handId === 1)));
  return players;
}

/** Waits until every player has a snapshot of this hand at `seq` or later. */
async function everyoneAt(players: TestPlayer[], handId: number, seq: number): Promise<void> {
  await Promise.all(players.map((p) => p.stateWhere((s) => !!s.game && (s.game.handId > handId || (s.game.handId === handId && s.game.seq >= seq)))));
}

/** Sends an action based on the player's latest snapshot, like the real client does. */
function act(player: TestPlayer, type: ActionType, amount?: number) {
  const { handId, seq } = gameOf(player.latest());
  return request(player.socket, 'game:action', { handId, seq, type, ...(amount === undefined ? {} : { amount }) });
}

const byId = (players: TestPlayer[], id: string) => players.find((p) => p.info.playerId === id) as TestPlayer;

/**
 * Plays until the current hand has a result: the player to act chooses with `decide`; while a
 * street is being dealt the fake clock moves on. Every step waits for all players to catch up.
 */
async function playHand(players: TestPlayer[], decide: (legal: LegalActions) => [ActionType, number?]): Promise<GameView> {
  for (let guard = 0; guard < 200; guard++) {
    const g = gameOf(players[0]?.latest());
    if (g.result) return g;
    if (g.toActSeat === null) {
      t.clock.runNext(); // the next street (or run-out card) is due
    } else {
      const seat = players[0]?.latest()?.room.seats[g.toActSeat];
      const actor = byId(players, seat?.playerId as string);
      const legal = gameOf(actor.latest()).legalActions as LegalActions;
      const res = await act(actor, ...decide(legal));
      expect(res).toEqual({ ok: true, data: {} });
    }
    await everyoneAt(players, g.handId, g.seq + 1);
  }
  throw new Error('hand did not finish');
}

const passive = (legal: LegalActions): [ActionType] => [legal.canCheck ? 'check' : 'call'];

describe('playing a hand over Socket.IO', () => {
  it('three players play a hand to showdown, then the next hand is dealt', async () => {
    const players = await startThreeHanded();
    const [alice, bob, carol] = players as [TestPlayer, TestPlayer, TestPlayer];

    // Everyone starts with their own two cards and nobody else's.
    for (const p of players) {
      const g = gameOf(p.latest());
      expect(g).toMatchObject({ handId: 1, buttonSeat: 0, sbSeat: 1, bbSeat: 2, toActSeat: 0, street: 'preflop' });
      for (const gp of g.players) expect(gp.holeCards !== null).toBe(gp.playerId === p.info.playerId);
    }
    expect(gameOf(alice.latest()).legalActions).toMatchObject({ canCall: true, callAmount: 10 });
    expect(gameOf(bob.latest()).legalActions).toBeNull();

    const final = await playHand(players, passive);
    expect(final.street).toBe('showdown');
    expect(final.board).toHaveLength(5);
    // R-7.3: every hand still in at showdown is shown to everyone, with a label.
    expect(final.result?.shown.map((s) => s.seat).sort()).toEqual([0, 1, 2]);
    for (const shown of final.result?.shown ?? []) expect(shown.label).toMatch(/\w/);
    for (const p of players) expect(gameOf(p.latest()).players.every((gp) => gp.holeCards !== null)).toBe(true);
    const pot = final.result?.pots.reduce((acc, pot) => acc + pot.amount, 0);
    expect(pot).toBe(30);

    const stacks = (alice.latest() as TableSnapshot).room.seats.map((s) => s?.stack ?? 0);
    expect(stacks.reduce((a, b) => a + b, 0)).toBe(3000);
    expect(alice.latest()?.room.table?.nextHandAt).toBe(t.clock.now() + T.showdownPauseMs);

    t.clock.advance(T.showdownPauseMs);
    await Promise.all(players.map((p) => p.stateWhere((s) => s.game?.handId === 2)));
    expect(gameOf(carol.latest())).toMatchObject({ handId: 2, buttonSeat: 1, sbSeat: 2, bbSeat: 0, result: null });
  });

  it('rejects out-of-turn, illegal, stale, duplicate and malformed actions with ack errors', async () => {
    const [alice, bob, carol] = (await startThreeHanded()) as [TestPlayer, TestPlayer, TestPlayer];
    const { handId, seq } = gameOf(alice.latest());

    expect(await act(bob, 'call')).toMatchObject({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(await act(alice, 'check')).toMatchObject({ ok: false, error: 'ILLEGAL_ACTION' });
    expect(await act(alice, 'raise', 15)).toMatchObject({ ok: false, error: 'INVALID_AMOUNT' });
    expect(await act(alice, 'raise', 5000)).toMatchObject({ ok: false, error: 'INVALID_AMOUNT' });
    expect(await request(alice.socket, 'game:action', { handId, seq: seq + 1, type: 'call' })).toMatchObject({
      ok: false,
      error: 'STALE_ACTION',
    });
    expect(await request(alice.socket, 'game:action', { handId: handId + 1, seq, type: 'call' })).toMatchObject({
      ok: false,
      error: 'STALE_ACTION',
    });

    const malformed: unknown[] = [
      { handId, seq, type: 'call', amount: 1.5 },
      { handId, seq, type: 'raise', amount: -20 },
      { handId, seq, type: 'raise', amount: 1e12 },
      { handId, seq, type: 'shove' },
      { handId, seq },
      { handId: '1', seq, type: 'call' },
      { handId, seq, type: 'call', playerId: bob.info.playerId },
    ];
    for (const payload of malformed) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately wrong payloads
      expect(await request(alice.socket, 'game:action', payload as any)).toMatchObject({ ok: false, error: 'INVALID_PAYLOAD' });
    }
    expect(gameOf(alice.latest())).toMatchObject({ seq, toActSeat: 0 }); // nothing happened

    // A double click: both copies arrive; the first is applied, the second is stale.
    const [first, second] = await Promise.all([act(alice, 'call'), act(alice, 'call')]);
    expect([first, second]).toEqual([
      { ok: true, data: {} },
      { ok: false, error: 'STALE_ACTION', message: expect.any(String) },
    ]);
    await everyoneAt([alice, bob, carol], handId, seq + 1);
    expect(gameOf(carol.latest())).toMatchObject({ seq: seq + 1, toActSeat: 1 });

    // Not in the room at all.
    const stranger = await t.player('Mallory');
    expect(await request(stranger.socket, 'game:action', { handId, seq: seq + 1, type: 'fold' })).toMatchObject({
      ok: false,
      error: 'NOT_IN_ROOM',
    });
  });

  it('never sends anyone a card they may not see, across many hands', async () => {
    const players = await startThreeHanded();
    const late = await t.player('Dave'); // joins mid-hand and watches first
    expect((await request(late.socket, 'room:join', { code: players[0]?.latest()?.room.code as string })).ok).toBe(true);
    players.push(late);

    const rnd = seededRandomInt(3);
    const mixed = (legal: LegalActions): [ActionType, number?] => {
      const roll = rnd(20);
      if (roll === 0 && (legal.canBet || legal.canRaise)) return ['allIn'];
      if (roll < 4) return ['fold'];
      if (roll < 7 && legal.canRaise) return ['raise', legal.minTo];
      if (roll < 7 && legal.canBet) return ['bet', legal.minTo];
      return passive(legal);
    };
    for (let hand = 0; hand < 12; hand++) {
      const g = await playHand(players, mixed);
      t.clock.advance(g.result?.wonByFold ? T.foldWinPauseMs : T.showdownPauseMs);
      await Promise.all(players.map((p) => p.stateWhere((s) => !s.game || s.game.handId > g.handId)));
      if (players[0]?.latest()?.room.table?.waitingForPlayers) break; // too few players with chips left
    }

    // Ground truth: each player's own cards per hand, as their own snapshots showed them.
    const ownCards = new Map<string, Card[]>();
    for (const p of players) {
      for (const s of p.received) {
        const mine = s.game?.players.find((gp) => gp.playerId === p.info.playerId)?.holeCards;
        if (s.game && mine) ownCards.set(`${s.game.handId}:${p.info.playerId}`, mine);
      }
    }

    let checked = 0;
    let reveals = 0;
    for (const p of players) {
      for (const s of p.received) {
        expect(s.room.youId).toBe(p.info.playerId); // every snapshot was built for this socket's player
        const g = s.game;
        if (!g) continue;
        checked++;
        const allowed = new Set<string>([...g.board]);
        for (const gp of g.players) {
          if (!gp.holeCards) continue;
          expect(gp.holeCards).toEqual(ownCards.get(`${g.handId}:${gp.playerId}`));
          if (gp.playerId !== p.info.playerId) {
            // Someone else's cards: only once no more betting is possible (R-5.8) or at showdown (R-7.3),
            // never folded hands, never a hand won by folds (R-7.4).
            reveals++;
            const active = g.players.filter((x) => x.status === 'active').length;
            expect(gp.status).not.toBe('folded');
            expect(g.toActSeat).toBeNull();
            if (g.result) expect(!g.result.wonByFold && g.result.shown.some((x) => x.playerId === gp.playerId)).toBe(true);
            else expect(active).toBeLessThanOrEqual(1);
          }
          for (const c of gp.holeCards) allowed.add(c);
        }
        const tokens = JSON.stringify(s).match(/"[2-9TJQKA][cdhs]"/g) ?? [];
        for (const token of tokens) expect(allowed.has(token.slice(1, 3))).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(reveals).toBeGreaterThan(0);
  });

  it('a player who leaves mid-hand is folded, and their socket gets no more snapshots', async () => {
    const [alice, bob, carol] = (await startThreeHanded()) as [TestPlayer, TestPlayer, TestPlayer];
    expect(await request(bob.socket, 'room:leave', {})).toEqual({ ok: true, data: {} });
    const seen = bob.received.length;
    await carol.stateWhere((s) => s.room.seats[1]?.leaving === true);
    expect(gameOf(carol.latest()).players[1]?.status).toBe('folded');

    await act(alice, 'fold'); // Carol wins by folds
    t.clock.advance(T.foldWinPauseMs);
    await carol.stateWhere((s) => s.game?.handId === 2);
    expect(carol.latest()?.room.seats[1]).toBeNull();
    expect(bob.received.length).toBe(seen);
  });
});

describe('turn timer over Socket.IO', () => {
  it('auto-folds when facing a bet and auto-checks when it can, with the deadline in every snapshot', async () => {
    const players = await startThreeHanded();
    const [alice, bob, carol] = players as [TestPlayer, TestPlayer, TestPlayer];
    const first = alice.latest() as TableSnapshot;
    expect(first.serverTime).toBe(t.clock.now());
    expect(gameOf(first).turnDeadline).toBe(t.clock.now() + TURN_MS);

    t.clock.advance(TURN_MS); // Alice faces the big blind: folded
    await everyoneAt(players, 1, 1);
    expect(gameOf(carol.latest()).players[0]?.lastAction).toEqual({ type: 'fold', allIn: false });
    expect(gameOf(carol.latest())).toMatchObject({ toActSeat: 1, turnDeadline: t.clock.now() + TURN_MS });

    expect(await act(bob, 'call')).toEqual({ ok: true, data: {} });
    await everyoneAt(players, 1, 2);
    t.clock.advance(TURN_MS); // Carol, the big blind, may check: checked
    await everyoneAt(players, 1, 3);
    expect(gameOf(alice.latest()).players[2]?.lastAction).toEqual({ type: 'check', allIn: false });

    t.clock.advance(T.streetDelayMs);
    await everyoneAt(players, 1, 4);
    expect(gameOf(bob.latest())).toMatchObject({ street: 'flop', toActSeat: 1 });
  });
});

describe('disconnect and reconnect mid-hand', () => {
  it("keeps the seat, times out the disconnected player's turn, and restores their view on reconnect", async () => {
    const players = await startThreeHanded();
    const [alice, bob, carol] = players as [TestPlayer, TestPlayer, TestPlayer];
    const bobsCards = gameOf(bob.latest()).players[1]?.holeCards;
    expect(bobsCards).not.toBeNull();

    bob.socket.disconnect();
    await carol.stateWhere((s) => s.room.seats[1]?.connected === false);
    expect(gameOf(carol.latest()).players[1]?.status).toBe('active'); // still in the hand

    expect(await act(alice, 'call')).toEqual({ ok: true, data: {} });
    await everyoneAt([alice, carol], 1, 1);
    expect(gameOf(carol.latest()).toActSeat).toBe(1); // the table waits for Bob...
    t.clock.advance(TURN_MS); // ...until his time runs out (R-9.2)
    await carol.stateWhere((s) => s.game?.players[1]?.status === 'folded');

    const back = await t.reconnect(bob);
    const snapshot = await back.stateWhere((s) => s.game?.handId === 1 && s.room.seats[1]?.connected === true);
    const view = gameOf(snapshot);
    expect(view.players[1]).toMatchObject({ status: 'folded', holeCards: bobsCards });
    expect(view.players[0]?.holeCards).toBeNull();
    expect(view.players[2]?.holeCards).toBeNull();
    expect(view.legalActions).toBeNull();
    expect(view.toActSeat).toBe(2);
    await alice.stateWhere((s) => s.room.seats[1]?.connected === true);
  });

  it('gives a reconnecting player whose turn it is their options and the running deadline', async () => {
    const players = await startThreeHanded();
    const [alice] = players as [TestPlayer, ...TestPlayer[]];
    const deadline = gameOf(alice.latest()).turnDeadline;
    alice.socket.disconnect();
    t.clock.advance(5_000);
    const back = await t.reconnect(alice);
    const view = gameOf(await back.stateWhere((s) => s.room.seats[0]?.connected === true));
    expect(view).toMatchObject({ toActSeat: 0, turnDeadline: deadline });
    expect(view.legalActions).toMatchObject({ canCall: true, callAmount: 10 });
    expect(await act(back, 'call')).toEqual({ ok: true, data: {} });
  });
});
