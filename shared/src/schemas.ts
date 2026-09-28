import { z } from 'zod';

/**
 * zod schemas for every client→server payload. The server parses with these before any handler
 * runs; unknown keys are rejected (strictObject).
 */

export const PingPayloadSchema = z.strictObject({});
export type PingPayload = z.infer<typeof PingPayloadSchema>;
