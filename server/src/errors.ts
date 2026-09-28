import type { ErrorCode } from '@poker/shared';

/**
 * An expected, user-facing failure (room full, not the host, ...). Socket handlers turn it into an
 * `{ ok: false, error, message }` ack. Anything else thrown is treated as an internal error.
 */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
