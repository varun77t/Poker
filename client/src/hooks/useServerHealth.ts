import { useEffect, useState } from 'react';

export interface ServerHealth {
  ok: true;
  uptime: number;
  sockets: number;
}

type HealthResult = ServerHealth | { ok: false };

async function fetchHealth(signal: AbortSignal): Promise<HealthResult> {
  try {
    const res = await fetch('/health', { signal });
    return res.ok ? ((await res.json()) as ServerHealth) : { ok: false };
  } catch {
    return { ok: false };
  }
}

/**
 * Fetches GET /health on mount and again whenever `refreshKey` changes (pass the socket connection
 * status so the result recovers after the server comes up or goes away). Returns null while loading,
 * or { ok: false } if unreachable.
 */
export function useServerHealth(refreshKey: unknown): HealthResult | null {
  const [health, setHealth] = useState<HealthResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetchHealth(controller.signal).then((result) => {
      if (!controller.signal.aborted) setHealth(result);
    });
    return () => controller.abort();
  }, [refreshKey]);

  return health;
}
