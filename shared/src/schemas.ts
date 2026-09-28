import { z } from 'zod';
import { DISPLAY_NAME_MAX_LENGTH, MAX_CHIP_AMOUNT, SETTINGS_BOUNDS } from './constants';
import { ACTION_TYPES } from './game';

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

export const UpdateSettingsPayloadSchema = z.strictObject({ settings: RoomSettingsSchema });
export type UpdateSettingsPayload = z.infer<typeof UpdateSettingsPayloadSchema>;

/** Settings keys whose values differ between two settings objects. */
export function changedSettingKeys(before: RoomSettings, after: RoomSettings): (keyof RoomSettings)[] {
  return (Object.keys(RoomSettingsSchema.shape) as (keyof RoomSettings)[]).filter((key) => before[key] !== after[key]);
}

/** Codes are normalized and checked server-side, so any short string is accepted here. */
export const JoinRoomPayloadSchema = z.strictObject({ code: z.string().max(16) });
export type JoinRoomPayload = z.infer<typeof JoinRoomPayloadSchema>;

/**
 * A player's action. `handId` and `seq` come from the snapshot the action was based on; the server
 * rejects anything else as STALE_ACTION. Whether `amount` is required, and its range, is the
 * engine's call (R-4.9); here it only has to be a sane whole number.
 */
export const GameActionPayloadSchema = z.strictObject({
  handId: z.int().min(0),
  seq: z.int().min(0),
  type: z.enum(ACTION_TYPES),
  amount: z.int().min(0).max(MAX_CHIP_AMOUNT).optional(),
});
export type GameActionPayload = z.infer<typeof GameActionPayloadSchema>;
