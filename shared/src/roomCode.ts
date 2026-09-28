import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from './constants';

/** Uppercases and strips whitespace and dashes, so " abc-234 " becomes "ABC234". */
export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]+/g, '');
}

/** True if `code` is already normalized and uses only the room-code alphabet. */
export function isValidRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of code) {
    if (!ROOM_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}
