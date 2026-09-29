export const MAX_SEATS = 5;
export const MIN_PLAYERS_TO_START = 2;

/** Room codes avoid visually ambiguous characters: 0/O, 1/I/L. See docs/product-spec.md §3.1. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export const DISPLAY_NAME_MAX_LENGTH = 20;

/** Largest chip amount accepted anywhere in a payload. */
export const MAX_CHIP_AMOUNT = 1_000_000_000;

/** Socket.IO max payload size in bytes (server `maxHttpBufferSize`). */
export const MAX_SOCKET_PAYLOAD_BYTES = 10_000;

/** Room setting bounds (docs/product-spec.md §3.5). Cross-field rules live in RoomSettingsSchema. */
export const SETTINGS_BOUNDS = {
  startingStack: { min: 100, max: 1_000_000 },
  smallBlind: { min: 1 },
  bigBlind: { min: 2 },
  /** The big blind may be at most startingStack / this. */
  minStackInBigBlinds: 10,
  turnSeconds: { min: 15, max: 120 },
} as const;

/** Computer players (docs/product-spec.md §3.7). */
export const BOT_LEVELS = ['easy', 'normal'] as const;
export type BotLevel = (typeof BOT_LEVELS)[number];

/** "Play against bots" seats this many Normal bots next to the host. */
export const SOLO_BOT_COUNT = 3;

export const DEFAULT_ROOM_SETTINGS = {
  startingStack: 1000,
  smallBlind: 5,
  bigBlind: 10,
  turnSeconds: 30,
  rebuys: true,
} as const;
