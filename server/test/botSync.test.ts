import { DEFAULT_ROOM_SETTINGS, type GameView, type TableSnapshot } from '@poker/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { request, startTestServer, type TestPlayer, type TestServer } from './helpers/testServer';
import { controlledRandomInt } from './helpers/random';

/**
 * Phase 7 end to end: bots over Socket.IO (product-spec §3.7). Real socket.io-client players, the
 * fake clock driving bot think times, streets and pauses.
 */

let t: TestServer;

beforeEach(async () => {
  t = await startTestServer({ randomInt: controlledRandomInt(7) });
});
afterEach(() => t.close());

async function createRoom(host: TestPlayer, bots?: ('easy' | 'medium')[]): Promise<string> {
  const res = await request(host.socket, 'room:create', { settings: DEFAULT_ROOM_SETTINGS, ...(bots ? { bots } : {}) });
  if (!res.ok) throw new Error(res.message);
  await host.stateWhere((s) => s.room.code === res.data.code);
  return res.data.code;
}

/**
 * R-7.3, R-5.8: someone else's hole cards may only appear once no more betting can happen: at
 * showdown, or in an all-in run-out (at most one player can still act). Folded hands never.
 */
function assertNoLeak(s: TableSnapshot): void {
  const g = s.game;
  if (!g) return;
  const canStillBet = g.players.filter((p) => p.status === 'active').length > 1 && !g.result;
  for (const p of g.players) {
    if (p.playerId === s.room.youId || p.holeCards === null) continue;
    expect(p.status, `folded hand of ${p.playerId} shown`).not.toBe('folded');
    expect(canStillBet, `hand ${g.handId}: ${p.playerId}'s cards shown while betting is open`).toBe(false);
  }
}

describe('bots over Socket.IO', () => {
  it('creates a room with bots and lets only the host add and remove them, with strict payloads', async () => {
    const alice = await t.player('Alice');
    const bob = await t.player('Bob');
    const code = await createRoom(alice, ['medium', 'medium', 'medium']);
    const seats = alice.latest()!.room.seats;
    expect(seats.map((s) => s && [s.displayName, s.isBot, s.botLevel])).toEqual([
      ['Alice', false, null],
      ['Ace Bot', true, 'medium'],
      ['King Bot', true, 'medium'],
      ['Queen Bot', true, 'medium'],
      null,
    ]);
    expect((await request(bob.socket, 'room:join', { code })).ok).toBe(true);

    expect(await request(bob.socket, 'room:addBot', { level: 'easy' })).toMatchObject({ ok: false, error: 'NOT_HOST' });
    expect(await request(alice.socket, 'room:addBot', { level: 'easy' })).toMatchObject({ ok: false, error: 'ROOM_FULL' });
    expect(await request(bob.socket, 'room:removeBot', { seat: 1 })).toMatchObject({ ok: false, error: 'NOT_HOST' });
    expect(await request(alice.socket, 'room:removeBot', { seat: 4 })).toMatchObject({ ok: false, error: 'INVALID_STATE' });

    // Strict schemas: unknown levels, extra keys, out-of-range seats, too many bots.
    const bad = [
      request(alice.socket, 'room:addBot', { level: 'hard' } as never),
      request(alice.socket, 'room:addBot', { level: 'easy', seat: 7 }),
      request(alice.socket, 'room:addBot', { level: 'easy', name: 'Sneaky' } as never),
      request(alice.socket, 'room:removeBot', { seat: 5 }),
      request(alice.socket, 'room:removeBot', { seat: '1' } as never),
      request(alice.socket, 'room:create', { settings: DEFAULT_ROOM_SETTINGS, bots: ['easy', 'easy', 'easy', 'easy', 'easy'] } as never),
      request(alice.socket, 'room:create', { settings: DEFAULT_ROOM_SETTINGS, bots: ['expert'] } as never),
    ];
    for (const res of await Promise.all(bad)) expect(res).toMatchObject({ ok: false, error: 'INVALID_PAYLOAD' });

    expect(await request(alice.socket, 'room:removeBot', { seat: 2 })).toEqual({ ok: true, data: {} });
    await bob.stateWhere((s) => s.room.seats[2] === null);
    expect(await request(alice.socket, 'room:addBot', { level: 'easy', seat: 3 })).toMatchObject({ ok: false, error: 'INVALID_STATE' });
    expect(await request(alice.socket, 'room:addBot', { level: 'easy', seat: 2 })).toEqual({ ok: true, data: { seat: 2 } });
    const after = await bob.stateWhere((s) => s.room.seats[2]?.isBot === true);
    expect(after.room.seats[2]).toMatchObject({ displayName: 'King Bot', botLevel: 'easy', connected: true });
    expect(after.room.hostId).toBe(alice.info.playerId);
  });

  it('one person plays 50 hands against three bots: chips are conserved and bot cards never leak', async () => {
    const alice = await t.player('Alice');
    const code = await createRoom(alice, ['medium', 'easy', 'medium']);
    const room = t.server.rooms.getRoom(code)!;
    expect((await request(alice.socket, 'game:start', {})).ok).toBe(true);

    const ledger = () =>
      room.seats.reduce((sum, s) => sum + (s ? s.stack - s.totalBuyIn : 0), 0) +
      [...room.departed.values()].reduce((sum, d) => sum + d.stack - d.totalBuyIn, 0);
    let lastChecked = 0;

    for (let step = 0; step < 20_000 && room.lastHandId <= 50; step++) {
      const snapshot = await alice.stateWhere((s) => s.version === room.version);
      const g: GameView | null = snapshot.game;
      const me = snapshot.room.seats[0];
      if (g?.legalActions) {
        // Alice plays it simple: call or check, and go all-in with a pair now and then.
        const [a, b] = g.players.find((p) => p.seat === 0)!.holeCards!;
        const shove = a[0] === b[0] && g.legalActions.canRaise && step % 3 === 0;
        const intent = shove ? { type: 'allIn' as const } : { type: g.legalActions.canCheck ? ('check' as const) : ('call' as const) };
        const res = await request(alice.socket, 'game:action', { handId: g.handId, seq: g.seq, ...intent });
        expect(res).toEqual({ ok: true, data: {} });
      } else if (me?.busted) {
        expect(await request(alice.socket, 'game:rebuy', {})).toEqual({ ok: true, data: {} });
      } else {
        expect(t.clock.runNext()).toBe(true); // a bot's think time, the next street or the next hand
      }
      // Between hands the seats hold every chip: seated plus departed, minus what was bought in, is zero.
      if (!room.table?.isDealtIn(alice.info.playerId) || g?.result) {
        if (room.lastHandId !== lastChecked) {
          expect(ledger()).toBe(0);
          lastChecked = room.lastHandId;
        }
      }
    }

    expect(room.lastHandId).toBeGreaterThan(50);
    expect(room.status).toBe('playing');
    expect(t.server.io.engine.clientsCount).toBe(1); // bots have no connection
    for (const s of alice.received) assertNoLeak(s);
    // Bots did show their cards at some showdowns: the check above had something to check.
    expect(alice.received.some((s) => s.game?.result?.shown.some((h) => h.playerId.startsWith('bot:')))).toBe(true);
  }, 60_000);
});
