import { DEFAULT_ROOM_SETTINGS, MAX_CHIP_AMOUNT, MAX_SOCKET_PAYLOAD_BYTES, type ActionType, type GameView, type TableSnapshot } from '@poker/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TIMINGS } from '../src/policies';
import { controlledRandomInt } from './helpers/random';
import { disconnected, request, startTestServer, type ClientSocket, type TestPlayer, type TestServer } from './helpers/testServer';

/**
 * Phase 9: the security and multiplayer audit, one test per attack in docs/security-report.md.
 * Every attack comes from a "malicious client": a real socket.io-client that skips the React app
 * and emits whatever it likes (DevTools, raw socket.emit). The server must refuse each one, leave
 * the game untouched, and never send anyone something they may not see.
 */

let t: TestServer;
let rng: ReturnType<typeof controlledRandomInt>;

beforeEach(async () => {
  rng = controlledRandomInt(9);
  t = await startTestServer({ randomInt: rng });
});
afterEach(() => t.close());

/** Emits anything, bypassing the typed client contract, and resolves with the ack. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately bypassing the typed contract
const raw = (socket: ClientSocket, event: string, payload?: unknown, timeoutMs = 2000): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately bypassing the typed contract
  (socket.timeout(timeoutMs) as any).emitWithAck(event, payload);

const gameOf = (s: TableSnapshot | undefined): GameView => {
  if (!s?.game) throw new Error('no game in snapshot');
  return s.game;
};

async function createRoom(host: TestPlayer, bots?: ('easy' | 'medium' | 'pro')[]): Promise<string> {
  const res = await request(host.socket, 'room:create', { settings: DEFAULT_ROOM_SETTINGS, ...(bots ? { bots } : {}) });
  if (!res.ok) throw new Error(res.message);
  await host.stateWhere((s) => s.room.code === res.data.code);
  return res.data.code;
}

/** Alice (host, seat 0, first button), Bob (1), Carol (2). Preflop, Alice acts first. */
async function startThreeHanded(): Promise<[TestPlayer, TestPlayer, TestPlayer]> {
  const players = [await t.player('Alice'), await t.player('Bob'), await t.player('Carol')] as [TestPlayer, TestPlayer, TestPlayer];
  const code = await createRoom(players[0]);
  for (const p of players.slice(1)) expect((await request(p.socket, 'room:join', { code })).ok).toBe(true);
  rng.force(0);
  expect(await request(players[0].socket, 'game:start', {})).toEqual({ ok: true, data: {} });
  await Promise.all(players.map((p) => p.stateWhere((s) => s.game?.handId === 1)));
  return players;
}

function act(player: TestPlayer, type: ActionType, amount?: number) {
  const { handId, seq } = gameOf(player.latest());
  return request(player.socket, 'game:action', { handId, seq, type, ...(amount === undefined ? {} : { amount }) });
}

/** Whose turn it is, by name, from a snapshot. */
const actorName = (s: TableSnapshot | undefined) => {
  const g = gameOf(s);
  return g.toActSeat === null ? null : s?.room.seats[g.toActSeat]?.displayName;
};

describe('identity', () => {
  it('S1 a player cannot act for another player, or out of turn', async () => {
    const [alice, bob] = await startThreeHanded();
    expect(actorName(alice.latest())).toBe('Alice');
    const before = gameOf(alice.latest()).seq;

    // Bob acts on Alice's turn: the server takes his identity from his session, so it is his action, out of turn.
    expect(await act(bob, 'fold')).toMatchObject({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(await act(bob, 'raise', 40)).toMatchObject({ ok: false, error: 'NOT_YOUR_TURN' });
    // ...and naming Alice in the payload is not a way around that.
    const { handId, seq } = gameOf(bob.latest());
    expect(await raw(bob.socket, 'game:action', { handId, seq, type: 'fold', playerId: alice.info.playerId })).toMatchObject({
      ok: false,
      error: 'INVALID_PAYLOAD',
    });
    expect(await raw(bob.socket, 'game:action', { handId, seq, type: 'fold', seat: 0 })).toMatchObject({ ok: false, error: 'INVALID_PAYLOAD' });

    expect(gameOf(alice.latest()).seq).toBe(before);
    expect(actorName(alice.latest())).toBe('Alice');
  });

  it('S2 spoofed identity fields are rejected on every event and over HTTP', async () => {
    const alice = await t.player('Alice');
    const mallory = await t.player('Mallory');
    const code = await createRoom(alice);
    const spoof = { playerId: alice.info.playerId };
    const cases: [string, unknown][] = [
      ['room:create', { settings: DEFAULT_ROOM_SETTINGS, ...spoof }],
      ['room:join', { code, ...spoof }],
      ['room:join', { code, displayName: 'Alice' }],
      ['room:leave', spoof],
      ['room:updateSettings', { settings: DEFAULT_ROOM_SETTINGS, ...spoof }],
      ['room:addBot', { level: 'easy', ...spoof }],
      ['room:removeBot', { seat: 1, ...spoof }],
      ['game:start', { hostId: alice.info.playerId }],
      ['game:rebuy', spoof],
      ['game:end', spoof],
      ['sync:request', { roomCode: code }],
    ];
    for (const [event, payload] of cases) {
      expect(await raw(mallory.socket, event, payload), event).toMatchObject({ ok: false, error: 'INVALID_PAYLOAD' });
    }
    // The session endpoint takes a name only; a smuggled playerId or token is a bad request.
    const res = await fetch(`${t.baseUrl}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Mallory', playerId: alice.info.playerId }),
    });
    expect(res.status).toBe(400);
    expect(alice.latest()!.room.seats.filter(Boolean).map((s) => s!.displayName)).toEqual(['Alice']);
  });

  it('S3 connecting needs a valid session token; a guessed or malformed one is refused', async () => {
    for (const token of [undefined, '', 'not-a-token', 42, { token: 'x' }, 'a'.repeat(5000)]) {
      const socket = t.connect(token);
      const err = await new Promise<Error>((resolve) => socket.once('connect_error', resolve));
      expect(err.message, String(token)).toBe('AUTH_INVALID');
    }
  });

  it('S4 nobody can act for a bot seat', async () => {
    const alice = await t.player('Alice');
    await createRoom(alice, ['medium', 'medium']);
    rng.force(1); // button on Ace Bot (seat 1): heads-up rules aside, three-handed the button acts first preflop
    expect(await request(alice.socket, 'game:start', {})).toEqual({ ok: true, data: {} });
    const s = await alice.stateWhere((x) => x.game?.handId === 1);
    const botSeat = gameOf(s).toActSeat as number;
    expect(s.room.seats[botSeat]?.isBot).toBe(true);
    // No clock advance, so the bot has not acted yet: its turn is open. Alice cannot take it.
    for (const type of ['fold', 'call', 'check'] as const) {
      expect(await act(alice, type)).toMatchObject({ ok: false, error: 'NOT_YOUR_TURN' });
    }
    expect(await act(alice, 'raise', 100)).toMatchObject({ ok: false, error: 'NOT_YOUR_TURN' });
    // There is no way to name the bot either.
    const { handId, seq } = gameOf(alice.latest());
    expect(await raw(alice.socket, 'game:action', { handId, seq, type: 'fold', playerId: `bot:${botSeat}` })).toMatchObject({
      ok: false,
      error: 'INVALID_PAYLOAD',
    });
    expect(gameOf(alice.latest()).toActSeat).toBe(botSeat);
  });
});

describe('the rules of the hand', () => {
  it('S5 negative, fractional, non-numeric, huge and out-of-range amounts are refused', async () => {
    const [alice] = await startThreeHanded();
    const { handId, seq } = gameOf(alice.latest());
    const malformed: unknown[] = [-10, 40.5, '40', null, true, [40], { value: 40 }, MAX_CHIP_AMOUNT + 1, Number.MAX_SAFE_INTEGER, 1e308];
    for (const amount of malformed) {
      expect(await raw(alice.socket, 'game:action', { handId, seq, type: 'raise', amount }), String(amount)).toMatchObject({
        ok: false,
        error: 'INVALID_PAYLOAD',
      });
    }
    // NaN and Infinity cannot even be sent: JSON turns them into null.
    for (const amount of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(await raw(alice.socket, 'game:action', { handId, seq, type: 'raise', amount })).toMatchObject({ ok: false, error: 'INVALID_PAYLOAD' });
    }
    t.clock.advance(5_000); // a fresh rate-limit allowance (20 events per 5 s); the turn clock still has 25 s
    // Well-formed but illegal for this spot: under the minimum raise, over the stack, and amounts where none belong.
    const legal = gameOf(alice.latest()).legalActions!;
    expect(await act(alice, 'raise', legal.minTo - 1)).toMatchObject({ ok: false, error: 'INVALID_AMOUNT' });
    expect(await act(alice, 'raise', legal.maxTo + 1)).toMatchObject({ ok: false, error: 'INVALID_AMOUNT' });
    expect(await act(alice, 'raise', MAX_CHIP_AMOUNT)).toMatchObject({ ok: false, error: 'INVALID_AMOUNT' });
    expect(await act(alice, 'raise')).toMatchObject({ ok: false });
    expect(await act(alice, 'bet', 100)).toMatchObject({ ok: false, error: 'ILLEGAL_ACTION' }); // there is already a bet: it's a raise
    expect(await act(alice, 'check')).toMatchObject({ ok: false, error: 'ILLEGAL_ACTION' }); // facing the big blind
    expect(await raw(alice.socket, 'game:action', { handId, seq, type: 'allin' })).toMatchObject({ ok: false, error: 'INVALID_PAYLOAD' });
    // Nothing moved.
    expect(gameOf(alice.latest()).seq).toBe(seq);
    expect(gameOf(alice.latest()).players.find((p) => p.seat === 0)?.stack).toBe(1000);
  });

  it('S6 replayed and duplicated actions are refused as stale', async () => {
    const [alice, bob] = await startThreeHanded();
    const { handId, seq } = gameOf(alice.latest());
    const payload = { handId, seq, type: 'call' as const };
    // A double click: two identical actions in flight at once. Exactly one lands.
    const [a, b] = await Promise.all([request(alice.socket, 'game:action', payload), request(alice.socket, 'game:action', payload)]);
    expect([a, b].filter((r) => r.ok)).toHaveLength(1);
    expect([a, b].find((r) => !r.ok)).toMatchObject({ error: 'STALE_ACTION' });
    await bob.stateWhere((s) => gameOf(s).seq > seq);
    // A replay of the old action later, and a made-up future seq or hand, are stale too.
    expect(await request(alice.socket, 'game:action', payload)).toMatchObject({ ok: false, error: 'STALE_ACTION' });
    const now = gameOf(bob.latest());
    expect(await request(bob.socket, 'game:action', { handId: now.handId, seq: now.seq + 5, type: 'call' })).toMatchObject({
      ok: false,
      error: 'STALE_ACTION',
    });
    expect(await request(bob.socket, 'game:action', { handId: now.handId + 1, seq: now.seq, type: 'call' })).toMatchObject({
      ok: false,
      error: 'STALE_ACTION',
    });
    expect(gameOf(bob.latest()).seq).toBe(now.seq);
  });

  it('S7 a player cannot act after folding, after leaving, or from a connection that was replaced', async () => {
    const [alice, bob, carol] = await startThreeHanded();
    expect(await act(alice, 'fold')).toEqual({ ok: true, data: {} });
    await bob.stateWhere((s) => actorName(s) === 'Bob');
    // Alice folded: she has no turn left in this hand, whatever she sends.
    for (const type of ['call', 'check', 'fold'] as const) {
      const res = await act(alice, type);
      expect(res.ok, type).toBe(false);
    }
    // Bob leaves mid-hand: he is folded and out of the room, so his actions go nowhere.
    const bobSnapshot = gameOf(bob.latest());
    expect(await request(bob.socket, 'room:leave', {})).toEqual({ ok: true, data: {} });
    expect(
      await request(bob.socket, 'game:action', { handId: bobSnapshot.handId, seq: bobSnapshot.seq, type: 'call' }),
    ).toMatchObject({ ok: false, error: 'NOT_IN_ROOM' });

    // Carol opens a second tab: the old connection is told and cut off, so it can no longer send anything.
    const gone = disconnected(carol.socket);
    const tab = await t.reconnect(carol);
    expect(await gone).toBe('io server disconnect');
    expect(carol.socket.connected).toBe(false);
    await expect(raw(carol.socket, 'game:action', { handId: 1, seq: 0, type: 'check' }, 300)).rejects.toThrow();
    expect(gameOf(await tab.stateWhere((s) => !!s.game)).handId).toBe(1);
  });

  it('S8 chips cannot be changed from the client', async () => {
    const [alice, bob] = await startThreeHanded();
    const before = gameOf(bob.latest()).players.map((p) => p.stack);
    // There is no event that sets chips; made-up ones are ignored (no handler, no ack) and change nothing.
    for (const event of ['game:setStack', 'room:setChips', 'state']) {
      await expect(raw(alice.socket, event, { stack: 1_000_000 }, 300)).rejects.toThrow();
    }
    // Betting more than you have is refused; an all-in is capped at the server's count of your chips.
    const legal = gameOf(alice.latest()).legalActions!;
    expect(legal.maxTo).toBe(1000);
    expect(await act(alice, 'raise', 5000)).toMatchObject({ ok: false, error: 'INVALID_AMOUNT' });
    // Rebuying while you still have chips (a free top-up) is refused.
    expect(await request(alice.socket, 'game:rebuy', {})).toMatchObject({ ok: false, error: 'REBUY_NOT_ALLOWED' });
    expect(gameOf(bob.latest()).players.map((p) => p.stack)).toEqual(before);
  });
});

describe('hidden information', () => {
  it('S9 no payload ever carries a card, token or other secret the receiver may not see', async () => {
    const players = await startThreeHanded();
    const tokens = players.map((p) => p.info.sessionToken);
    // Record every event each socket receives, of any name.
    const events = players.map(() => [] as { name: string; payload: unknown }[]);
    players.forEach((p, i) => p.socket.onAny((name: string, payload: unknown) => events[i]!.push({ name, payload })));

    // Play hands with every kind of ending: folds, calls to showdown, and all-ins with a run-out.
    const styles: ((legal: NonNullable<GameView['legalActions']>, who: number) => [ActionType, number?])[] = [
      (l, who) => (who === 0 ? ['fold'] : [l.canCheck ? 'check' : 'call']),
      (l) => [l.canCheck ? 'check' : 'call'],
      (l) => (l.canRaise || l.canBet ? [l.canBet ? 'bet' : 'raise', l.maxTo] : [l.canCheck ? 'check' : 'call']),
    ];
    for (let hand = 0; hand < 9; hand++) {
      const style = styles[hand % styles.length]!;
      for (let step = 0; step < 60; step++) {
        const s = players[0].latest()!;
        if (!s.game) break;
        const g = s.game;
        if (g.result || g.toActSeat === null) {
          t.clock.runNext();
        } else {
          const who = players.findIndex((p) => p.info.playerId === s.room.seats[g.toActSeat!]?.playerId);
          const me = players[who]!;
          const legal = gameOf(me.latest()).legalActions!;
          expect((await act(me, ...style(legal, who))).ok).toBe(true);
        }
        await new Promise((r) => setTimeout(r, 5));
        if (players[0].latest()?.game?.handId !== g.handId || !players[0].latest()?.game) break;
      }
      if (players[0].latest()?.room.status !== 'playing') break;
    }

    let checked = 0;
    events.forEach((list, i) => {
      const viewer = players[i]!;
      for (const { name, payload } of list) {
        // Only room snapshots (and the take-over notice) are ever pushed.
        expect(['state', 'session:replaced']).toContain(name);
        const text = JSON.stringify(payload);
        // No session token of anyone, not even your own, is ever echoed back.
        for (const token of tokens) expect(text.includes(token)).toBe(false);
        if (name !== 'state') continue;
        const s = payload as TableSnapshot;
        expect(s.room.youId).toBe(viewer.info.playerId);
        const g = s.game;
        if (!g) continue;
        const canStillBet = g.players.filter((p) => p.status === 'active').length > 1 && !g.result;
        for (const p of g.players) {
          if (p.playerId === viewer.info.playerId || p.holeCards === null) continue;
          checked++;
          // R-7.3 / R-5.8: another player's cards only once no more betting can happen; folded hands never.
          expect(p.status, `folded hand shown to ${viewer.info.displayName}`).not.toBe('folded');
          expect(canStillBet, `cards shown to ${viewer.info.displayName} while betting is open`).toBe(false);
        }
        // The deck, and the cards still to come, are never in a view.
        expect(text).not.toMatch(/"deck"|"remaining"|"burn/);
      }
    });
    expect(checked).toBeGreaterThan(0); // showdowns and run-outs did reveal cards, to the right people
  });
});

describe('rooms', () => {
  it('S10 invalid room codes are refused without touching any room', async () => {
    const alice = await t.player('Alice');
    const mallory = await t.player('Mallory');
    const code = await createRoom(alice);
    for (const bad of ['', 'ABC', 'ABCDEFG', '!!!!!!', 'O0I1L0', '<b>hi', '../../', ' '.repeat(10)]) {
      expect(await request(mallory.socket, 'room:join', { code: bad }), bad).toMatchObject({ ok: false, error: 'ROOM_NOT_FOUND' });
    }
    for (const bad of [12345, null, { code }, 'A'.repeat(17)]) {
      expect(await raw(mallory.socket, 'room:join', { code: bad })).toMatchObject({ ok: false, error: 'INVALID_PAYLOAD' });
    }
    // The real code works however it is typed.
    expect(await request(mallory.socket, 'room:join', { code: ` ${code.toLowerCase().slice(0, 3)}-${code.slice(3)} ` })).toMatchObject({ ok: true });
  });

  it('S11 guessing room codes is rate limited per player', async () => {
    const mallory = await t.player('Mallory');
    const results = [];
    for (let i = 0; i < 12; i++) results.push(await request(mallory.socket, 'room:join', { code: 'ABCDE' + 'FGHJKM'[i % 6] }));
    const errors = results.map((r) => (r.ok ? 'ok' : r.error));
    expect(errors.slice(0, 10).every((e) => e === 'ROOM_NOT_FOUND')).toBe(true);
    expect(errors.slice(10)).toEqual(['RATE_LIMITED', 'RATE_LIMITED']);
    // The allowance comes back slowly (10 a minute), not by reconnecting.
    const again = await t.reconnect(mallory);
    expect(await request(again.socket, 'room:join', { code: 'ABCDEF' })).toMatchObject({ ok: false, error: 'RATE_LIMITED' });
    t.clock.advance(60_000);
    expect(await request(again.socket, 'room:join', { code: 'ABCDEF' })).toMatchObject({ ok: false, error: 'ROOM_NOT_FOUND' });
  });

  it('S12 a full room turns the sixth player away', async () => {
    const host = await t.player('Host');
    const code = await createRoom(host);
    for (const name of ['P2', 'P3', 'P4', 'P5']) expect((await request((await t.player(name)).socket, 'room:join', { code })).ok).toBe(true);
    const sixth = await t.player('Six');
    expect(await request(sixth.socket, 'room:join', { code })).toMatchObject({ ok: false, error: 'ROOM_FULL' });
    expect(host.latest()!.room.seats.every(Boolean)).toBe(true);
  });

  it('S13 only the host can start, change settings, add or remove bots, or end the game', async () => {
    const alice = await t.player('Alice');
    const bob = await t.player('Bob');
    const code = await createRoom(alice, ['easy']);
    expect((await request(bob.socket, 'room:join', { code })).ok).toBe(true);
    const settings = { ...DEFAULT_ROOM_SETTINGS, startingStack: 5000 };
    expect(await request(bob.socket, 'room:updateSettings', { settings })).toMatchObject({ ok: false, error: 'NOT_HOST' });
    expect(await request(bob.socket, 'room:addBot', { level: 'pro' })).toMatchObject({ ok: false, error: 'NOT_HOST' });
    expect(await request(bob.socket, 'room:removeBot', { seat: 1 })).toMatchObject({ ok: false, error: 'NOT_HOST' });
    expect(await request(bob.socket, 'game:start', {})).toMatchObject({ ok: false, error: 'NOT_HOST' });
    expect(await request(alice.socket, 'game:start', {})).toEqual({ ok: true, data: {} });
    await bob.stateWhere((s) => !!s.game);
    expect(await request(bob.socket, 'game:end', {})).toMatchObject({ ok: false, error: 'NOT_HOST' });
    // And even the host cannot change settings mid-game.
    expect(await request(alice.socket, 'room:updateSettings', { settings })).toMatchObject({ ok: false, error: 'INVALID_STATE' });
    const s = bob.latest()!;
    expect(s.room.settings).toEqual(DEFAULT_ROOM_SETTINGS);
    expect(s.room.status).toBe('playing');
    expect(s.room.seats.filter(Boolean)).toHaveLength(3);
  });
});

describe('abuse', () => {
  it('S14 floods are rate limited per player, and reconnecting does not reset the allowance', async () => {
    await t.close();
    t = await startTestServer({ rateLimits: { socketEvents: { count: 5, windowMs: 5_000 }, maxStrikes: 50 } });
    const mallory = await t.player('Mallory');
    const burst = await Promise.all(Array.from({ length: 5 }, () => request(mallory.socket, 'sys:ping', {})));
    expect(burst.every((r) => r.ok)).toBe(true);
    const again = await t.reconnect(mallory);
    expect(await request(again.socket, 'sys:ping', {})).toMatchObject({ ok: false, error: 'RATE_LIMITED' });
    t.clock.advance(5_000);
    expect(await request(again.socket, 'sys:ping', {})).toMatchObject({ ok: true });
  });

  it('S15 creating rooms over and over is rate limited', async () => {
    const mallory = await t.player('Mallory');
    const results = [];
    for (let i = 0; i < 7; i++) results.push(await request(mallory.socket, 'room:create', { settings: DEFAULT_ROOM_SETTINGS }));
    expect(results.map((r) => (r.ok ? 'ok' : r.error))).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'RATE_LIMITED', 'RATE_LIMITED']);
    // Each create left the previous room, so only the latest one still has Mallory in it.
    expect(t.server.rooms.roomCount).toBeLessThanOrEqual(5);
  });

  it('S16 oversized payloads are cut off by the transport; the server carries on', async () => {
    const mallory = await t.player('Mallory');
    const gone = disconnected(mallory.socket);
    mallory.socket.emit('room:join', { code: 'x'.repeat(MAX_SOCKET_PAYLOAD_BYTES * 2) } as never, () => {});
    expect(await gone).toBe('transport close');
    // HTTP bodies are capped too.
    const res = await fetch(`${t.baseUrl}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'x'.repeat(20_000) }),
    });
    expect(res.status).toBe(413);
    // Everyone else is unaffected.
    const alice = await t.player('Alice');
    expect(await request(alice.socket, 'sys:ping', {})).toMatchObject({ ok: true });
  });

  it('S17 a disconnected player cannot hold the table hostage', async () => {
    const [alice, bob] = await startThreeHanded();
    expect(actorName(alice.latest())).toBe('Alice');
    alice.socket.disconnect();
    // Alice's turn times out while she is away; play moves on for everyone else.
    t.clock.advance(DEFAULT_ROOM_SETTINGS.turnSeconds * 1000 + DEFAULT_TIMINGS.streetDelayMs);
    const s = await bob.stateWhere((x) => actorName(x) !== 'Alice');
    expect(gameOf(s).players.find((p) => p.seat === 0)?.status).toBe('folded');
  });
});
