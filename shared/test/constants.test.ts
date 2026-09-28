import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_SETTINGS, RANKS, ROOM_CODE_ALPHABET, RoomSettingsSchema, SUITS } from '../src';

describe('ROOM_CODE_ALPHABET', () => {
  it('has no visually ambiguous characters', () => {
    for (const ch of ['0', 'O', '1', 'I', 'L']) {
      expect(ROOM_CODE_ALPHABET).not.toContain(ch);
    }
  });

  it('has no duplicates and is uppercase', () => {
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(ROOM_CODE_ALPHABET.length);
    expect(ROOM_CODE_ALPHABET).toBe(ROOM_CODE_ALPHABET.toUpperCase());
  });
});

describe('cards', () => {
  it('defines a 52-card deck worth of ranks and suits', () => {
    expect(RANKS.length * SUITS.length).toBe(52);
  });
});

describe('DEFAULT_ROOM_SETTINGS', () => {
  it('passes its own schema', () => {
    expect(RoomSettingsSchema.safeParse(DEFAULT_ROOM_SETTINGS).success).toBe(true);
  });
});
