import type { ErrorCode } from '@poker/shared';
import { expect } from 'vitest';
import { DomainError } from '../../src/errors';

/** Asserts that `fn` throws a DomainError with `code`. */
export function expectDomainError(fn: () => unknown, code: ErrorCode): void {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe(code);
    return;
  }
  throw new Error(`Expected DomainError ${code}, but nothing was thrown`);
}
