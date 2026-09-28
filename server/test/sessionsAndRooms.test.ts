import { AUTH_INVALID, DEFAULT_ROOM_SETTINGS, type TableSnapshot } from '@poker/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TIMINGS } from '../src/policies';
import { disconnected, request, startTestServer, type TestPlayer, type TestServer } from './helpers/testServer';

const names = (s: TableSnapshot) => s.room.seats.map((seat) => seat?.displayName ?? null);
const seatCount = (s: TableSnapshot) => s.room.seats.filter(Boolean).length;

async function createRoom(host: TestPlayer): Promise<string> {
  const res = await request(host.socket, 'room:create', { settings: DEFAULT_ROOM_SETTINGS });
  if (!res.ok) throw new Error(res.message);
  return res.data.code;
}

describe('guest sessions (HTTP)', () => {
  let t: TestServer;
  beforeEach(async () => {
    t = await startTestServer();
  });
  afterEach(() => t.close());

  it('creates a session with a trimmed display name', async () => {
    const { status, body } = await t.createSession('  Ada  ');
    expect(status).toBe(201);
    expect(body).toMatchObject({ ok: true, data: { displayName: 'Ada' } });
  });

  it('rejects invalid names', async () => {
    for (const displayName of ['', 'x'.repeat(21), '<b>hi</b>']) {
      const { status, body } = await t.createSession(displayName);
      expect(status).toBe(400);
      expect(body).toMatchObject({ ok: false, error: 'INVALID_PAYLOAD' });
    }
  });

  it('renames an existing session when the token is presented, keeping the player id', async () => {
    const first = await t.createSession('Ada');
    if (!first.body.ok) throw new Error('setup');
    const renamed = await t.createSession('Grace', first.body.data.sessionToken);
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ ok: true, data: { playerId: first.body.data.playerId, displayName: 'Grace' } });

    const unknownToken = await t.createSession('Linus', 'not-a-real-token');
    expect(unknownToken.status).toBe(201);
    if (unknownToken.body.ok) expect(unknownToken.body.data.playerId).not.toBe(first.body.data.playerId);
  });

  it('rate limits session creation per IP', async () => {
    await t.close();
    t = await startTestServer({ rateLimits: { sessionCreates: { count: 3, windowMs: 60_000 } } });
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await t.createSession(`p${i}`)).status);
    expect(statuses).toEqual([201, 201, 201, 429, 429]);
  });
});

describe('socket authentication', () => {
  let t: TestServer;
  beforeEach(async () => {
    t = await startTestServer();
  });
  afterEach(() => t.close());

  it.each([['missing', undefined], ['unknown', 'bogus'], ['wrong type', 12345]])(
    'rejects a %s token with AUTH_INVALID',
    async (_label, token) => {
      const socket = t.connect(token);
      const err = await new Promise<Error>((resolve) => socket.once('connect_error', resolve));
      expect(err.message).toBe(AUTH_INVALID);
    },
  );

  it('rejects an expired session', async () => {
    const { body } = await t.createSession('Ada');
    if (!body.ok) throw new Error('setup');
    t.clock.advance(DEFAULT_TIMINGS.sessionTtlMs + 1);
    const socket = t.connect(body.data.sessionToken);
    const err = await new Promise<Error>((resolve) => socket.once('connect_error', resolve));
    expect(err.message).toBe(AUTH_INVALID);
  });

  it('replaces an older connection for the same session', async () => {
    const alice = await t.player('Alice');
    await createRoom(alice);
    const replaced = new Promise<void>((resolve) => alice.socket.once('session:replaced', () => resolve()));
    const gone = disconnected(alice.socket);

    const second = t.connect(alice.info.sessionToken);
    const snapshot = await new Promise<TableSnapshot>((resolve) => second.once('state', resolve));
    await replaced;
    await gone;

    expect(snapshot.room.youId).toBe(alice.info.playerId);
    expect(snapshot.room.seats[0]?.connected).toBe(true); // the replacement never marks the seat disconnected
  });
});

describe('rooms over Socket.IO', () => {
  let t: TestServer;
  beforeEach(async () => {
    t = await startTestServer();
  });
  afterEach(() => t.close());

  it('three players create and join a room and all see each other', async () => {
    const [alice, bob, carol] = [await t.player('Alice'), await t.player('Bob'), await t.player('Carol')];
    const code = await createRoom(alice);

    expect(await request(bob.socket, 'room:join', { code: code.toLowerCase() })).toEqual({ ok: true, data: { code } });
    expect(await request(carol.socket, 'room:join', { code })).toEqual({ ok: true, data: { code } });

    for (const player of [alice, bob, carol]) {
      const s = await player.stateWhere((snap) => seatCount(snap) === 3);
      expect(names(s)).toEqual(['Alice', 'Bob', 'Carol', null, null]);
      expect(s.room.hostId).toBe(alice.info.playerId);
      expect(s.room.youId).toBe(player.info.playerId);
      expect(s.room.status).toBe('waiting');
      expect(s.room.code).toBe(code);
    }
  });

  it('rejects joining a nonexistent room', async () => {
    const bob = await t.player('Bob');
    expect(await request(bob.socket, 'room:join', { code: 'ZZZZZZ' })).toMatchObject({ ok: false, error: 'ROOM_NOT_FOUND' });
  });

  it('rejects the sixth player with ROOM_FULL', async () => {
    const players = [];
    for (let i = 0; i < 6; i++) players.push(await t.player(`P${i}`));
    const code = await createRoom(players[0]!);
    for (const pl of players.slice(1, 5)) expect((await request(pl.socket, 'room:join', { code })).ok).toBe(true);
    expect(await request(players[5]!.socket, 'room:join', { code })).toMatchObject({ ok: false, error: 'ROOM_FULL' });
  });

  it('leaving frees the seat for others, and host migrates when the host leaves', async () => {
    const [alice, bob, carol] = [await t.player('Alice'), await t.player('Bob'), await t.player('Carol')];
    const code = await createRoom(alice);
    await request(bob.socket, 'room:join', { code });
    await request(carol.socket, 'room:join', { code });

    expect(await request(bob.socket, 'room:leave', {})).toEqual({ ok: true, data: {} });
    await carol.stateWhere((s) => names(s)[1] === null);

    await request(alice.socket, 'room:leave', {});
    const s = await carol.stateWhere((snap) => seatCount(snap) === 1);
    expect(s.room.hostId).toBe(carol.info.playerId);
    expect(await request(alice.socket, 'room:leave', {})).toMatchObject({ ok: false, error: 'NOT_IN_ROOM' });
  });

  it('only the host can start, and only with at least 2 players', async () => {
    const [alice, bob] = [await t.player('Alice'), await t.player('Bob')];
    await createRoom(alice);
    expect(await request(alice.socket, 'game:start', {})).toMatchObject({ ok: false, error: 'NOT_ENOUGH_PLAYERS' });

    await request(bob.socket, 'room:join', { code: alice.latest()!.room.code });
    expect(await request(bob.socket, 'game:start', {})).toMatchObject({ ok: false, error: 'NOT_HOST' });
    expect(await request(alice.socket, 'game:start', {})).toEqual({ ok: true, data: {} });
    expect((await bob.stateWhere((s) => s.room.status === 'playing')).room.status).toBe('playing');
  });

  it('the host can change settings in the lobby; everyone sees them and the new stacks', async () => {
    const [alice, bob] = [await t.player('Alice'), await t.player('Bob')];
    const code = await createRoom(alice);
    await request(bob.socket, 'room:join', { code });
    const settings = { ...DEFAULT_ROOM_SETTINGS, startingStack: 5000, smallBlind: 25, bigBlind: 50, turnSeconds: 60 };

    expect(await request(bob.socket, 'room:updateSettings', { settings })).toMatchObject({ ok: false, error: 'NOT_HOST' });
    expect(await request(alice.socket, 'room:updateSettings', { settings })).toEqual({ ok: true, data: {} });

    for (const player of [alice, bob]) {
      const s = await player.stateWhere((snap) => snap.room.settings.startingStack === 5000);
      expect(s.room.settings).toEqual(settings);
      expect(s.room.seats.filter(Boolean).map((seat) => seat?.stack)).toEqual([5000, 5000]);
    }

    await request(alice.socket, 'game:start', {});
    expect(await request(alice.socket, 'room:updateSettings', { settings: DEFAULT_ROOM_SETTINGS })).toMatchObject({
      ok: false,
      error: 'INVALID_STATE',
    });
  });

  it('snapshot versions increase', async () => {
    const [alice, bob] = [await t.player('Alice'), await t.player('Bob')];
    const code = await createRoom(alice);
    const v1 = alice.latest()!.version;
    await request(bob.socket, 'room:join', { code });
    const v2 = (await alice.stateWhere((s) => seatCount(s) === 2)).version;
    expect(v2).toBeGreaterThan(v1);
  });

  it('sync:request reports the current room and re-sends the snapshot', async () => {
    const alice = await t.player('Alice');
    expect(await request(alice.socket, 'sync:request', {})).toEqual({ ok: true, data: { roomCode: null } });
    const code = await createRoom(alice);
    expect(await request(alice.socket, 'sync:request', {})).toEqual({ ok: true, data: { roomCode: code } });
  });
});

describe('untrusted input', () => {
  let t: TestServer;
  beforeEach(async () => {
    t = await startTestServer();
  });
  afterEach(() => t.close());

  it('rejects malformed payloads with INVALID_PAYLOAD', async () => {
    const alice = await t.player('Alice');
    const bad: [string, unknown][] = [
      ['room:create', {}],
      ['room:create', { settings: { ...DEFAULT_ROOM_SETTINGS, bigBlind: -10 } }],
      ['room:create', { settings: { ...DEFAULT_ROOM_SETTINGS, startingStack: '1000' } }],
      ['room:join', { code: 12345 }],
      ['room:join', { code: 'x'.repeat(100) }],
      ['room:join', 'ABC234'],
      ['room:leave', null],
      ['room:updateSettings', { settings: { ...DEFAULT_ROOM_SETTINGS, smallBlind: 50, bigBlind: 10 } }],
      ['room:updateSettings', { settings: { ...DEFAULT_ROOM_SETTINGS, turnSeconds: 5 } }],
      ['room:updateSettings', DEFAULT_ROOM_SETTINGS],
      ['game:start', []],
    ];
    for (const [event, payload] of bad) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately bypassing the typed contract
      const res = await (alice.socket.timeout(2000) as any).emitWithAck(event, payload);
      expect(res, `${event} ${JSON.stringify(payload)}`).toMatchObject({ ok: false, error: 'INVALID_PAYLOAD' });
    }
  });

  it('ignores identity smuggled into payloads', async () => {
    const [alice, mallory] = [await t.player('Alice'), await t.player('Mallory')];
    const code = await createRoom(alice);
    await request(mallory.socket, 'room:join', { code });

    // Mallory pretends to be Alice (the host) in every way a payload could.
    for (const [event, payload] of [
      ['game:start', { playerId: alice.info.playerId }],
      ['room:leave', { playerId: alice.info.playerId }],
      ['room:join', { code, playerId: alice.info.playerId }],
      ['room:updateSettings', { settings: DEFAULT_ROOM_SETTINGS, playerId: alice.info.playerId }],
    ] as const) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately bypassing the typed contract
      const res = await (mallory.socket.timeout(2000) as any).emitWithAck(event, payload);
      expect(res).toMatchObject({ ok: false, error: 'INVALID_PAYLOAD' });
    }
    // And the only valid form acts as Mallory, never Alice.
    expect(await request(mallory.socket, 'game:start', {})).toMatchObject({ ok: false, error: 'NOT_HOST' });
    const s = alice.latest()!;
    expect(s.room.hostId).toBe(alice.info.playerId);
    expect(names(s)).toEqual(['Alice', 'Mallory', null, null, null]);
  });

  it('survives events sent without an ack callback', async () => {
    const alice = await t.player('Alice');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately bypassing the typed contract
    (alice.socket as any).emit('room:create', { settings: DEFAULT_ROOM_SETTINGS });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately bypassing the typed contract
    (alice.socket as any).emit('unknown:event', {}, () => {});
    expect(await request(alice.socket, 'sys:ping', {})).toMatchObject({ ok: true });
    expect(alice.latest()).toBeUndefined(); // the ack-less create was dropped
  });

  it('rate limits floods and limits room-code guessing', async () => {
    await t.close();
    t = await startTestServer({
      rateLimits: { socketEvents: { count: 5, windowMs: 5_000 }, roomJoins: { count: 3, windowMs: 60_000 } },
    });
    const alice = await t.player('Alice');
    const results = await Promise.all(Array.from({ length: 8 }, () => request(alice.socket, 'sys:ping', {})));
    expect(results.filter((r) => !r.ok && r.error === 'RATE_LIMITED')).toHaveLength(3);

    t.clock.advance(5_000);
    const guesses = [];
    for (const code of ['AAAAAA', 'BBBBBB', 'CCCCCC', 'DDDDDD']) guesses.push(await request(alice.socket, 'room:join', { code }));
    expect(guesses.map((g) => (g.ok ? 'ok' : g.error))).toEqual([
      'ROOM_NOT_FOUND',
      'ROOM_NOT_FOUND',
      'ROOM_NOT_FOUND',
      'RATE_LIMITED',
    ]);
  });

  it('disconnects sockets that keep flooding', async () => {
    await t.close();
    t = await startTestServer({ rateLimits: { socketEvents: { count: 2, windowMs: 60_000 }, maxStrikes: 5 } });
    const alice = await t.player('Alice');
    const gone = disconnected(alice.socket);
    for (let i = 0; i < 10; i++) alice.socket.emit('sys:ping', {}, () => {});
    expect(await gone).toBe('io server disconnect');
  });
});

describe('disconnects in the lobby', () => {
  let t: TestServer;
  beforeEach(async () => {
    t = await startTestServer();
  });
  afterEach(() => t.close());

  it('shows the player as disconnected, then frees the seat after the grace window', async () => {
    const [alice, bob] = [await t.player('Alice'), await t.player('Bob')];
    const code = await createRoom(alice);
    await request(bob.socket, 'room:join', { code });

    bob.socket.disconnect();
    await alice.stateWhere((s) => s.room.seats[1]?.connected === false);

    t.clock.advance(DEFAULT_TIMINGS.lobbyDisconnectGraceMs);
    await alice.stateWhere((s) => seatCount(s) === 1);
  });

  it('restores the seat when the player reconnects in time', async () => {
    const [alice, bob] = [await t.player('Alice'), await t.player('Bob')];
    const code = await createRoom(alice);
    await request(bob.socket, 'room:join', { code });

    bob.socket.disconnect();
    await alice.stateWhere((s) => s.room.seats[1]?.connected === false);
    t.clock.advance(DEFAULT_TIMINGS.lobbyDisconnectGraceMs - 1);

    const again = t.connect(bob.info.sessionToken);
    const snapshot = await new Promise<TableSnapshot>((resolve) => again.once('state', resolve));
    expect(snapshot.room.youId).toBe(bob.info.playerId);
    await alice.stateWhere((s) => s.room.seats[1]?.connected === true);

    t.clock.advance(DEFAULT_TIMINGS.lobbyDisconnectGraceMs * 2);
    expect(seatCount(alice.latest()!)).toBe(2);
  });
});
