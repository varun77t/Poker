import { DEFAULT_ROOM_SETTINGS, ROOM_CODE_ALPHABET, isValidRoomCode, type ErrorCode } from '@poker/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '../src/errors';
import { DEFAULT_TIMINGS } from '../src/policies';
import { toRoomView, type Room } from '../src/rooms/room';
import { RoomManager, type PlayerRef } from '../src/rooms/roomManager';
import { FakeClock } from './helpers/fakeClock';

const GRACE = DEFAULT_TIMINGS.lobbyDisconnectGraceMs;
const TTL = DEFAULT_TIMINGS.emptyRoomTtlMs;

const p = (id: string, displayName = id): PlayerRef => ({ playerId: id, displayName });

function expectError(fn: () => unknown, code: ErrorCode): void {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe(code);
    return;
  }
  throw new Error(`Expected DomainError ${code}, but nothing was thrown`);
}

const occupants = (room: Room) => room.seats.map((s) => s?.playerId ?? null);

describe('RoomManager', () => {
  let clock: FakeClock;
  let rooms: RoomManager;
  let changes: Room[];
  let deleted: string[];

  beforeEach(() => {
    clock = new FakeClock();
    changes = [];
    deleted = [];
    rooms = new RoomManager({
      clock,
      timings: DEFAULT_TIMINGS,
      onRoomChanged: (room) => changes.push(room),
      onRoomDeleted: (code) => deleted.push(code),
    });
  });

  describe('create', () => {
    it('creates a waiting room with the creator seated at seat 0 as host', () => {
      const room = rooms.create(p('alice'), DEFAULT_ROOM_SETTINGS);
      expect(isValidRoomCode(room.code)).toBe(true);
      expect(room.status).toBe('waiting');
      expect(room.hostId).toBe('alice');
      expect(occupants(room)).toEqual(['alice', null, null, null, null]);
      expect(room.seats[0]?.stack).toBe(DEFAULT_ROOM_SETTINGS.startingStack);
      expect(rooms.getRoomOf('alice')).toBe(room);
      expect(changes).toEqual([room]);
      expect(room.version).toBe(1);
    });

    it('generates unique codes', () => {
      const codes = new Set<string>();
      for (let i = 0; i < 300; i++) codes.add(rooms.create(p(`p${i}`), DEFAULT_ROOM_SETTINGS).code);
      expect(codes.size).toBe(300);
    });

    it('retries when a generated code collides', () => {
      // First code is all 'A' (index 0) twice, then all 'B'.
      const sequence = [...Array(12).fill(0), ...Array(6).fill(1)];
      const seeded = new RoomManager({
        clock,
        timings: DEFAULT_TIMINGS,
        onRoomChanged: () => {},
        randomInt: () => sequence.shift() ?? 2,
      });
      expect(seeded.create(p('a'), DEFAULT_ROOM_SETTINGS).code).toBe('AAAAAA');
      expect(seeded.create(p('b'), DEFAULT_ROOM_SETTINGS).code).toBe(ROOM_CODE_ALPHABET[1]!.repeat(6));
    });

    it('leaves the current room first', () => {
      const first = rooms.create(p('alice'), DEFAULT_ROOM_SETTINGS);
      const second = rooms.create(p('alice'), DEFAULT_ROOM_SETTINGS);
      expect(occupants(first).every((s) => s === null)).toBe(true);
      expect(rooms.getRoomOf('alice')).toBe(second);
    });
  });

  describe('join', () => {
    it('seats the player in the lowest free seat and normalizes the code', () => {
      const room = rooms.create(p('alice'), DEFAULT_ROOM_SETTINGS);
      rooms.join(p('bob'), room.code.toLowerCase());
      rooms.join(p('carol'), ` ${room.code.slice(0, 3)}-${room.code.slice(3)} `);
      expect(occupants(room)).toEqual(['alice', 'bob', 'carol', null, null]);

      rooms.leave('bob');
      rooms.join(p('dave'), room.code);
      expect(occupants(room)).toEqual(['alice', 'dave', 'carol', null, null]);
    });

    it('rejects nonexistent and malformed codes with ROOM_NOT_FOUND', () => {
      rooms.create(p('alice'), DEFAULT_ROOM_SETTINGS);
      for (const code of ['ZZZZZZ', '', 'ABC', 'ABCDEFGH', '0OIL11', '<script>']) {
        expectError(() => rooms.join(p('bob'), code), 'ROOM_NOT_FOUND');
      }
      expect(rooms.getRoomOf('bob')).toBeUndefined();
    });

    it('rejects a full room without removing the player from their current room', () => {
      const full = rooms.create(p('p0'), DEFAULT_ROOM_SETTINGS);
      for (let i = 1; i < 5; i++) rooms.join(p(`p${i}`), full.code);
      const own = rooms.create(p('zed'), DEFAULT_ROOM_SETTINGS);

      expectError(() => rooms.join(p('zed'), full.code), 'ROOM_FULL');
      expect(rooms.getRoomOf('zed')).toBe(own);
      expect(occupants(full)).toHaveLength(5);
    });

    it('is idempotent for a room the player is already in', () => {
      const room = rooms.create(p('alice'), DEFAULT_ROOM_SETTINGS);
      rooms.join(p('bob'), room.code);
      const version = room.version;
      expect(rooms.join(p('bob'), room.code)).toBe(room);
      expect(occupants(room)).toEqual(['alice', 'bob', null, null, null]);
      expect(room.version).toBe(version);
    });

    it('moves the player out of their previous room', () => {
      const a = rooms.create(p('alice'), DEFAULT_ROOM_SETTINGS);
      const b = rooms.create(p('bob'), DEFAULT_ROOM_SETTINGS);
      rooms.join(p('carol'), a.code);
      rooms.join(p('carol'), b.code);
      expect(occupants(a)).toEqual(['alice', null, null, null, null]);
      expect(occupants(b)).toEqual(['bob', 'carol', null, null, null]);
    });

    it('marks players joining a running game as waiting for the next hand', () => {
      const room = rooms.create(p('alice'), DEFAULT_ROOM_SETTINGS);
      rooms.join(p('bob'), room.code);
      rooms.start('alice');
      rooms.join(p('carol'), room.code);
      expect(room.seats[2]?.waitingForNextHand).toBe(true);
      expect(room.seats[1]?.waitingForNextHand).toBe(false);
    });
  });

  describe('leave and host', () => {
    it('frees the seat and reports NOT_IN_ROOM afterwards', () => {
      const room = rooms.create(p('alice'), DEFAULT_ROOM_SETTINGS);
      rooms.join(p('bob'), room.code);
      rooms.leave('bob');
      expect(occupants(room)).toEqual(['alice', null, null, null, null]);
      expect(rooms.getRoomOf('bob')).toBeUndefined();
      expectError(() => rooms.leave('bob'), 'NOT_IN_ROOM');
    });

    it('identifies the creator as host and migrates host clockwise when they leave', () => {
      const room = rooms.create(p('s0'), DEFAULT_ROOM_SETTINGS);
      for (const id of ['s1', 's2', 's3']) rooms.join(p(id), room.code);
      rooms.leave('s1'); // seats: s0, -, s2, s3
      expect(room.hostId).toBe('s0');

      rooms.leave('s0'); // next occupied clockwise from seat 0 is seat 2
      expect(room.hostId).toBe('s2');

      rooms.leave('s2'); // from seat 2 → seat 3
      expect(room.hostId).toBe('s3');
    });

    it('wraps around when migrating host', () => {
      const room = rooms.create(p('s0'), DEFAULT_ROOM_SETTINGS);
      for (const id of ['s1', 's2', 's3', 's4']) rooms.join(p(id), room.code);
      rooms.leave('s0');
      rooms.leave('s2');
      rooms.leave('s3');
      // host is s1; occupied: s1 (1), s4 (4). s1 leaves → s4
      rooms.leave('s1');
      expect(room.hostId).toBe('s4');
      // s4 is alone; nobody to migrate to
      rooms.join(p('s0b'), room.code); // takes seat 0
      rooms.leave('s4');
      expect(room.hostId).toBe('s0b');
    });
  });

  describe('empty room cleanup', () => {
    it('deletes a room after it has been empty for the TTL', () => {
      const room = rooms.create(p('alice'), DEFAULT_ROOM_SETTINGS);
      rooms.leave('alice');
      expect(room.emptySince).toBe(clock.now());

      clock.advance(TTL - 1);
      expect(rooms.getRoom(room.code)).toBe(room);
      clock.advance(1);
      expect(rooms.getRoom(room.code)).toBeUndefined();
      expect(deleted).toEqual([room.code]);
    });

    it('keeps the room if someone joins within the TTL, and makes them host', () => {
      const room = rooms.create(p('alice'), DEFAULT_ROOM_SETTINGS);
      rooms.leave('alice');
      clock.advance(TTL / 2);
      rooms.join(p('bob'), room.code);
      clock.advance(TTL);
      expect(rooms.getRoom(room.code)).toBe(room);
      expect(room.hostId).toBe('bob');
      expect(room.emptySince).toBeNull();
      expect(deleted).toEqual([]);
    });
  });

  describe('lobby disconnect grace', () => {
    it('removes a disconnected lobby player after the grace window', () => {
      const room = rooms.create(p('alice'), DEFAULT_ROOM_SETTINGS);
      rooms.join(p('bob'), room.code);
      expect(rooms.setConnected('bob', false)).toBe(true);
      expect(room.seats[1]?.connected).toBe(false);

      clock.advance(GRACE - 1);
      expect(rooms.getRoomOf('bob')).toBe(room);
      clock.advance(1);
      expect(rooms.getRoomOf('bob')).toBeUndefined();
      expect(occupants(room)).toEqual(['alice', null, null, null, null]);
    });

    it('keeps the seat if the player reconnects within the grace window', () => {
      const room = rooms.create(p('alice'), DEFAULT_ROOM_SETTINGS);
      rooms.join(p('bob'), room.code);
      rooms.setConnected('bob', false);
      clock.advance(GRACE / 2);
      expect(rooms.setConnected('bob', true)).toBe(true);
      clock.advance(GRACE * 2);
      expect(room.seats[1]?.playerId).toBe('bob');
      expect(room.seats[1]?.connected).toBe(true);
    });

    it('migrates host when a disconnected host times out', () => {
      const room = rooms.create(p('alice'), DEFAULT_ROOM_SETTINGS);
      rooms.join(p('bob'), room.code);
      rooms.setConnected('alice', false);
      clock.advance(GRACE);
      expect(room.hostId).toBe('bob');
    });

    it('does not apply the lobby grace window once the game is running', () => {
      // In a game, disconnected players stay seated; only R-9.3 (3 missed hands) removes them.
      const room = rooms.create(p('alice'), DEFAULT_ROOM_SETTINGS);
      rooms.join(p('bob'), room.code);
      rooms.setConnected('bob', false);
      rooms.start('alice');
      clock.advance(GRACE + 1);
      expect(rooms.getRoomOf('bob')).toBe(room);
    });

    it('returns false and changes nothing for players not in a room', () => {
      expect(rooms.setConnected('ghost', false)).toBe(false);
      expect(clock.pendingTimers).toBe(0);
    });
  });

  describe('start', () => {
    it('enforces host-only, minimum players and current status', () => {
      const room = rooms.create(p('alice'), DEFAULT_ROOM_SETTINGS);
      expectError(() => rooms.start('alice'), 'NOT_ENOUGH_PLAYERS');
      rooms.join(p('bob'), room.code);
      expectError(() => rooms.start('bob'), 'NOT_HOST');
      expectError(() => rooms.start('nobody'), 'NOT_IN_ROOM');

      rooms.start('alice');
      expect(room.status).toBe('playing');
      expectError(() => rooms.start('alice'), 'INVALID_STATE');
    });
  });

  describe('updateSettings', () => {
    const bigger = { ...DEFAULT_ROOM_SETTINGS, startingStack: 2000, smallBlind: 10, bigBlind: 20, rebuys: false };

    it('lets the host change settings in the lobby and resets every stack', () => {
      const room = rooms.create(p('alice'), DEFAULT_ROOM_SETTINGS);
      rooms.join(p('bob'), room.code);
      const version = room.version;

      rooms.updateSettings('alice', bigger);
      expect(room.settings).toEqual(bigger);
      expect(room.settings).not.toBe(bigger); // stored as a copy
      expect(room.seats.filter(Boolean).map((s) => [s?.stack, s?.totalBuyIn])).toEqual([
        [2000, 2000],
        [2000, 2000],
      ]);
      expect(room.version).toBe(version + 1);

      rooms.join(p('carol'), room.code); // later joiners get the new stack too
      expect(room.seats[2]?.stack).toBe(2000);
    });

    it('is host-only and needs a seat', () => {
      const room = rooms.create(p('alice'), DEFAULT_ROOM_SETTINGS);
      rooms.join(p('bob'), room.code);
      expectError(() => rooms.updateSettings('bob', bigger), 'NOT_HOST');
      expectError(() => rooms.updateSettings('nobody', bigger), 'NOT_IN_ROOM');
      expect(room.settings).toEqual(DEFAULT_ROOM_SETTINGS);
    });

    it('is locked while a game is running', () => {
      const room = rooms.create(p('alice'), DEFAULT_ROOM_SETTINGS);
      rooms.join(p('bob'), room.code);
      rooms.start('alice');
      expectError(() => rooms.updateSettings('alice', bigger), 'INVALID_STATE');
      expect(room.settings).toEqual(DEFAULT_ROOM_SETTINGS);
    });

    it('after a finished game, stores new settings for the restart without touching final stacks', () => {
      const room = rooms.create(p('alice'), DEFAULT_ROOM_SETTINGS);
      room.status = 'finished';
      room.seats[0]!.stack = 1234;
      rooms.updateSettings('alice', bigger);
      expect(room.settings).toEqual(bigger);
      expect(room.seats[0]?.stack).toBe(1234);
    });

    it('does nothing when the settings are unchanged', () => {
      const room = rooms.create(p('alice'), DEFAULT_ROOM_SETTINGS);
      const version = room.version;
      rooms.updateSettings('alice', { ...DEFAULT_ROOM_SETTINGS });
      expect(room.version).toBe(version);
    });

    it('follows host migration', () => {
      const room = rooms.create(p('alice'), DEFAULT_ROOM_SETTINGS);
      rooms.join(p('bob'), room.code);
      rooms.leave('alice');
      rooms.updateSettings('bob', bigger);
      expect(room.settings).toEqual(bigger);
    });
  });

  describe('rename', () => {
    it('updates the seat name and broadcasts', () => {
      const room = rooms.create(p('alice', 'Alice'), DEFAULT_ROOM_SETTINGS);
      const version = room.version;
      rooms.rename('alice', 'Ally');
      expect(room.seats[0]?.displayName).toBe('Ally');
      expect(room.version).toBe(version + 1);
    });
  });

  describe('toRoomView', () => {
    it('suffixes duplicate names by join order, case-insensitively', () => {
      const room = rooms.create(p('a', 'Sam'), DEFAULT_ROOM_SETTINGS);
      rooms.join(p('b', 'Kim'), room.code);
      rooms.join(p('c', 'sam'), room.code);
      rooms.join(p('d', 'Sam'), room.code);
      const view = toRoomView(room, 'b');
      expect(view.seats.map((s) => s?.displayName ?? null)).toEqual(['Sam', 'Kim', 'sam (2)', 'Sam (3)', null]);
      expect(view.youId).toBe('b');
      expect(view.seats).toHaveLength(5);
    });

    it('does not expose internal fields', () => {
      const room = rooms.create(p('a'), DEFAULT_ROOM_SETTINGS);
      const seat = toRoomView(room, 'a').seats[0];
      expect(seat).not.toHaveProperty('joinSeq');
      expect(seat).not.toHaveProperty('totalBuyIn');
    });
  });
});
