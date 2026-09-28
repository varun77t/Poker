import { useEffect, useState } from 'react';
import { socket } from '../socket/socket';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

const PING_INTERVAL_MS = 5000;
const PING_TIMEOUT_MS = 3000;

/** Tracks the socket connection and measures round-trip latency with sys:ping. */
export function useConnection(): { status: ConnectionStatus; latencyMs: number | null } {
  const [status, setStatus] = useState<ConnectionStatus>(socket.connected ? 'connected' : 'connecting');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const ping = async () => {
      if (!socket.connected) return;
      const startedAt = performance.now();
      try {
        const res = await socket.timeout(PING_TIMEOUT_MS).emitWithAck('sys:ping', {});
        if (!cancelled && res.ok) setLatencyMs(Math.round(performance.now() - startedAt));
      } catch {
        // Timed out; the disconnect handler covers real outages.
      }
    };

    const onConnect = () => {
      setStatus('connected');
      void ping();
    };
    const onDisconnect = () => {
      setStatus('disconnected');
      setLatencyMs(null);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onDisconnect);
    if (socket.connected) void ping();
    else socket.connect();

    const interval = window.setInterval(() => void ping(), PING_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onDisconnect);
    };
  }, []);

  return { status, latencyMs };
}
