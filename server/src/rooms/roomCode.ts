import { randomInt as cryptoRandomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@poker/shared';

/** Returns a uniformly random integer in [0, maxExclusive). */
export type RandomInt = (maxExclusive: number) => number;

export const secureRandomInt: RandomInt = (maxExclusive) => cryptoRandomInt(maxExclusive);

export function generateRoomCode(randomInt: RandomInt = secureRandomInt): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/** Generates a code not currently in use. ~887M possible codes, so collisions are rare. */
export function generateUniqueRoomCode(
  isTaken: (code: string) => boolean,
  randomInt: RandomInt = secureRandomInt,
  maxAttempts = 20,
): string {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateRoomCode(randomInt);
    if (!isTaken(code)) return code;
  }
  throw new Error(`Could not generate a unique room code after ${maxAttempts} attempts`);
}
