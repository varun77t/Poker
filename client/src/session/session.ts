import { DisplayNameSchema } from '@poker/shared';
import { postSession } from '../lib/api';
import { saveName, saveSession } from '../lib/storage';
import { connectAs } from '../socket/connection';
import { getState, setState } from '../state/store';

export type EnsureSessionResult = { ok: true } | { ok: false; message: string };

/**
 * Makes sure there is a session under `rawName`: creates one, renames the current one, or does
 * nothing if it already matches. Then connects the socket.
 */
export async function ensureSession(rawName: string): Promise<EnsureSessionResult> {
  const parsed = DisplayNameSchema.safeParse(rawName);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid name.' };
  const name = parsed.data;

  const current = getState().session;
  if (current && current.displayName === name) {
    connectAs(current);
    return { ok: true };
  }

  const res = await postSession(name, current?.sessionToken);
  if (!res.ok) return { ok: false, message: res.message };

  saveSession(res.data);
  saveName(res.data.displayName);
  setState({ session: res.data });
  connectAs(res.data);
  return { ok: true };
}
