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
