import { isValidRoomCode } from '@poker/shared';
import { describe, expect, it } from 'vitest';
import { generateRoomCode, generateUniqueRoomCode } from '../src/rooms/roomCode';

describe('room codes', () => {
  it('generates valid 6-character codes from the unambiguous alphabet', () => {
    for (let i = 0; i < 1000; i++) expect(isValidRoomCode(generateRoomCode())).toBe(true);
  });

  it('gives up after too many collisions', () => {
    expect(() => generateUniqueRoomCode(() => true, () => 0, 5)).toThrow(/unique room code/);
  });
});
