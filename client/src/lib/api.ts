import type { Ack, SessionInfo } from '@poker/shared';

/**
 * POST /api/session. With a token, renames that session (same player); without one, or if the token is
 * no longer valid, the server creates a new session.
 */
export async function postSession(displayName: string, token?: string): Promise<Ack<SessionInfo>> {
  try {
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ displayName }),
    });
    return (await res.json()) as Ack<SessionInfo>;
  } catch {
    return { ok: false, error: 'INTERNAL', message: 'Could not reach the server. Check your connection.' };
  }
}
