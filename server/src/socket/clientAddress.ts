import type { IncomingHttpHeaders } from 'node:http';

/**
 * The client's address, the same way Express computes req.ip with `trust proxy` set to a hop count:
 * with n trusted proxies, the client is the n-th entry from the right of X-Forwarded-For. With no
 * trusted proxies, or a missing header, it is the socket's own peer address.
 */
export function clientAddress(handshake: { address: string; headers: IncomingHttpHeaders }, trustedHops: number): string {
  if (trustedHops > 0) {
    const header = handshake.headers['x-forwarded-for'];
    const list = (Array.isArray(header) ? header.join(',') : (header ?? ''))
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const entry = list[list.length - trustedHops];
    if (entry) return entry;
  }
  return handshake.address;
}
