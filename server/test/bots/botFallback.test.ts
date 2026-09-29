import { describe, expect, it, vi } from 'vitest';
import { decide } from '../../src/bots/strategy';
import type * as Strategy from '../../src/bots/strategy';
import { createTableHarness } from '../helpers/table';

/**
 * The table never trusts a bot blindly (§3.7): if a strategy throws or picks an illegal action, the
 * error is logged and the bot checks, else folds, so a hand can never stall on a bot.
 */

vi.mock('../../src/bots/strategy', async (importOriginal) => {
  const actual = await importOriginal<typeof Strategy>();
  return { ...actual, decide: vi.fn(actual.decide) };
});

/** Alice and one bot, heads-up; alice (button, small blind) acts first. */
function botToAct(call: boolean) {
  const h = createTableHarness(['alice']);
  h.rooms.addBot('alice', 'medium');
  h.start();
  if (call) h.act('alice', 'call');
  else h.act('alice', 'raise', 40);
  expect(h.room.table?.pendingTimer).toBe('bot');
  return h;
}

describe('bot fallback', () => {
  it('replaces an illegal bot action with a check when checking is free', () => {
    vi.mocked(decide).mockReturnValueOnce({ type: 'raise', amount: 1 }); // below the minimum raise
    const h = botToAct(true);
    h.clock.runNext();
    expect(h.game().players.find((p) => p.seat === 1)?.lastAction).toMatchObject({ type: 'check' });
    expect(h.errors).toHaveLength(1);
  });

  it('replaces a strategy that throws with a fold when there is a bet to call', () => {
    vi.mocked(decide).mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const h = botToAct(false);
    h.clock.runNext();
    expect(h.game().result?.wonByFold).toBe(true);
    expect(h.game().players.find((p) => p.seat === 1)?.status).toBe('folded');
    expect(h.errors).toHaveLength(1);
  });
});
