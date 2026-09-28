import { z } from 'zod';
import { DISPLAY_NAME_MAX_LENGTH, SETTINGS_BOUNDS } from './constants';

/**
 * zod schemas for every client→server payload and HTTP body. The server parses with these before
 * any handler runs. Objects are strict: unknown keys (e.g. a spoofed playerId) are rejected.
 */

export const DisplayNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Enter a name.' })
  .max(DISPLAY_NAME_MAX_LENGTH, { error: `Use at most ${DISPLAY_NAME_MAX_LENGTH} characters.` })
  .regex(/^[\p{L}\p{N} _.'-]+$/u, { error: "Use letters, numbers, spaces and _ - . ' only." })
  .transform((name) => name.replace(/\s+/g, ' '));

export const CreateSessionBodySchema = z.strictObject({ displayName: DisplayNameSchema });
export type CreateSessionBody = z.input<typeof CreateSessionBodySchema>;

const int = (min: number, max: number) =>
  z.int({ error: 'Enter a whole number.' }).min(min, { error: `Minimum is ${min}.` }).max(max, { error: `Maximum is ${max}.` });

export const RoomSettingsSchema = z
  .strictObject({
    startingStack: int(SETTINGS_BOUNDS.startingStack.min, SETTINGS_BOUNDS.startingStack.max),
    smallBlind: int(SETTINGS_BOUNDS.smallBlind.min, SETTINGS_BOUNDS.startingStack.max),
    bigBlind: int(SETTINGS_BOUNDS.bigBlind.min, SETTINGS_BOUNDS.startingStack.max),
    turnSeconds: int(SETTINGS_BOUNDS.turnSeconds.min, SETTINGS_BOUNDS.turnSeconds.max),
    rebuys: z.boolean(),
  })
  .refine((s) => s.smallBlind <= s.bigBlind, {
    error: 'Small blind cannot be larger than the big blind.',
    path: ['smallBlind'],
  })
  .refine((s) => s.bigBlind * SETTINGS_BOUNDS.minStackInBigBlinds <= s.startingStack, {
    error: `Starting stack must be at least ${SETTINGS_BOUNDS.minStackInBigBlinds} big blinds.`,
    path: ['bigBlind'],
  });
export type RoomSettings = z.infer<typeof RoomSettingsSchema>;

export const EmptyPayloadSchema = z.strictObject({});
export type EmptyPayload = z.infer<typeof EmptyPayloadSchema>;

export const CreateRoomPayloadSchema = z.strictObject({ settings: RoomSettingsSchema });
export type CreateRoomPayload = z.infer<typeof CreateRoomPayloadSchema>;

/** Codes are normalized and checked server-side, so any short string is accepted here. */
export const JoinRoomPayloadSchema = z.strictObject({ code: z.string().max(16) });
export type JoinRoomPayload = z.infer<typeof JoinRoomPayloadSchema>;
