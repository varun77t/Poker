import { describe, expect, it } from 'vitest';
import {
  CreateRoomPayloadSchema,
  DEFAULT_ROOM_SETTINGS,
  DisplayNameSchema,
  EmptyPayloadSchema,
  GameActionPayloadSchema,
  JoinRoomPayloadSchema,
  RoomSettingsSchema,
  UpdateSettingsPayloadSchema,
  changedSettingKeys,
  isValidRoomCode,
  normalizeRoomCode,
} from '../src';

describe('DisplayNameSchema', () => {
  it('trims and collapses whitespace', () => {
    expect(DisplayNameSchema.parse('  Ada   Lovelace ')).toBe('Ada Lovelace');
  });

  it('accepts unicode letters, digits and _ - . \'', () => {
    for (const name of ['José', 'Zoë_2', "O'Brien", 'a.b-c', '李雷']) {
      expect(DisplayNameSchema.safeParse(name).success, name).toBe(true);
    }
  });

  it('rejects empty, too long, markup and emoji', () => {
    for (const name of ['', '   ', 'x'.repeat(21), '<script>', 'a/b', '🂡 ace']) {
      expect(DisplayNameSchema.safeParse(name).success, name).toBe(false);
    }
  });
});

describe('RoomSettingsSchema', () => {
  const valid = { ...DEFAULT_ROOM_SETTINGS };

  it('accepts the defaults', () => {
    expect(RoomSettingsSchema.parse(valid)).toEqual(valid);
  });

  it('rejects a small blind larger than the big blind', () => {
    const res = RoomSettingsSchema.safeParse({ ...valid, smallBlind: 20, bigBlind: 10 });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.path).toEqual(['smallBlind']);
  });

  it('requires a starting stack of at least 10 big blinds', () => {
    expect(RoomSettingsSchema.safeParse({ ...valid, startingStack: 100, bigBlind: 10 }).success).toBe(true);
    const res = RoomSettingsSchema.safeParse({ ...valid, startingStack: 100, bigBlind: 11 });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.path).toEqual(['bigBlind']);
  });

  it('rejects non-integers, out-of-range values and wrong types', () => {
    for (const patch of [
      { startingStack: 1000.5 },
      { startingStack: 99 },
      { startingStack: 1_000_001 },
      { smallBlind: 0 },
      { bigBlind: 1, smallBlind: 1 },
      { turnSeconds: 14 },
      { turnSeconds: 121 },
      { rebuys: 'yes' },
      { startingStack: '1000' },
      { bigBlind: Number.NaN },
      { smallBlind: -5 },
    ]) {
      expect(RoomSettingsSchema.safeParse({ ...valid, ...patch }).success, JSON.stringify(patch)).toBe(false);
    }
  });

  it('rejects unknown keys', () => {
    expect(RoomSettingsSchema.safeParse({ ...valid, hostId: 'x' }).success).toBe(false);
  });
});

describe('changedSettingKeys', () => {
  it('lists exactly the keys whose values differ', () => {
    expect(changedSettingKeys(DEFAULT_ROOM_SETTINGS, { ...DEFAULT_ROOM_SETTINGS })).toEqual([]);
    expect(
      changedSettingKeys(DEFAULT_ROOM_SETTINGS, { ...DEFAULT_ROOM_SETTINGS, bigBlind: 20, rebuys: false }),
    ).toEqual(['bigBlind', 'rebuys']);
  });
});

describe('payload schemas are strict', () => {
  it('rejects spoofed identity fields', () => {
    expect(EmptyPayloadSchema.safeParse({ playerId: 'someone-else' }).success).toBe(false);
    expect(JoinRoomPayloadSchema.safeParse({ code: 'ABC234', playerId: 'x' }).success).toBe(false);
    expect(CreateRoomPayloadSchema.safeParse({ settings: DEFAULT_ROOM_SETTINGS, hostId: 'x' }).success).toBe(false);
    expect(UpdateSettingsPayloadSchema.safeParse({ settings: DEFAULT_ROOM_SETTINGS, playerId: 'x' }).success).toBe(false);
  });

  it('rejects non-object payloads', () => {
    for (const payload of [null, undefined, 'x', 42, []]) {
      expect(EmptyPayloadSchema.safeParse(payload).success).toBe(false);
    }
  });
});

describe('GameActionPayloadSchema', () => {
  const base = { handId: 3, seq: 12 };

  it('accepts every action type, with or without an amount', () => {
    for (const type of ['fold', 'check', 'call', 'allIn'] as const) {
      expect(GameActionPayloadSchema.safeParse({ ...base, type }).success).toBe(true);
    }
    // Whether an amount belongs is the engine's call (R-4.9), not the schema's.
    expect(GameActionPayloadSchema.safeParse({ ...base, type: 'raise', amount: 40 }).success).toBe(true);
    expect(GameActionPayloadSchema.safeParse({ ...base, type: 'bet' }).success).toBe(true);
  });

  it('rejects non-integer, negative or huge numbers, unknown types and extra keys', () => {
    for (const payload of [
      { ...base, type: 'raise', amount: 20.5 },
      { ...base, type: 'raise', amount: -10 },
      { ...base, type: 'raise', amount: 1e10 },
      { ...base, type: 'raise', amount: '40' },
      { ...base, type: 'shove' },
      { handId: -1, seq: 0, type: 'fold' },
      { handId: 1, seq: 0.5, type: 'fold' },
      { seq: 0, type: 'fold' },
      { ...base, type: 'fold', playerId: 'someone-else' },
    ]) {
      expect(GameActionPayloadSchema.safeParse(payload).success, JSON.stringify(payload)).toBe(false);
    }
  });
});

describe('room codes', () => {
  it('normalizes case, spaces and dashes', () => {
    expect(normalizeRoomCode(' abc-234 ')).toBe('ABC234');
    expect(normalizeRoomCode('ab c2 34')).toBe('ABC234');
  });

  it('validates length and alphabet', () => {
    expect(isValidRoomCode('ABC234')).toBe(true);
    expect(isValidRoomCode('ABC23')).toBe(false);
    expect(isValidRoomCode('ABC2345')).toBe(false);
    expect(isValidRoomCode('ABCD0O')).toBe(false); // 0 and O are excluded
    expect(isValidRoomCode('abc234')).toBe(false); // must be normalized first
  });
});
