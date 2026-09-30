import { expect, type Page } from '@playwright/test';

/** Sets the name on the landing page (the session is created when the player goes on). */
export async function enterName(page: Page, name: string): Promise<void> {
  await page.getByLabel('Your name').fill(name);
}

/** The hand number from the table's top bar ("Hand 12"), or 0 before the first hand. */
export async function handNumber(page: Page): Promise<number> {
  const text = await page
    .locator('header')
    .getByText(/^Hand\s+\d+$/)
    .textContent({ timeout: 1000 })
    .catch(() => null);
  return text ? Number(text.replace(/\D/g, '')) : 0;
}

/** The viewer's action panel. */
export const actions = (page: Page) => page.getByRole('region', { name: 'Your actions' });

/**
 * Plays passively (check, else call) for every page whose turn it is, until the first page's table
 * reaches hand `target`. `useKeys` presses C instead of clicking, to exercise the shortcut.
 */
export async function playUntilHand(pages: Page[], target: number, { useKeys = false, timeoutMs = 180_000 } = {}): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await handNumber(pages[0]!)) >= target) return;
    for (const page of pages) {
      const panel = actions(page);
      const myTurn = await panel.getByText('Your turn.').isVisible().catch(() => false);
      if (!myTurn) continue;
      const button = panel.getByRole('button', { name: /^(Check|Call)/ });
      if (!(await button.isEnabled().catch(() => false))) continue;
      if (useKeys) await page.keyboard.press('c');
      else await button.click({ timeout: 2000 }).catch(() => undefined);
    }
    await pages[0]!.waitForTimeout(200);
  }
  throw new Error(`The table did not reach hand ${target} in time (at hand ${await handNumber(pages[0]!)}).`);
}

/** A seat on the table, found by the name on its plaque. */
export const seatOf = (page: Page, name: string) => page.locator('[data-seat]').filter({ hasText: name });

/** Your own two cards are face up and every other live hand is face down (no leaked cards). */
export async function expectOnlyOwnCardsVisible(page: Page, others: string[]): Promise<void> {
  const mine = page.locator('[data-seat]').filter({ hasText: 'You' }).getByRole('img');
  await expect(mine).toHaveCount(2);
  for (const card of await mine.all()) await expect(card).not.toHaveAttribute('aria-label', 'Face-down card');
  for (const name of others) {
    for (const card of await seatOf(page, name).getByRole('img').all()) {
      await expect(card).toHaveAttribute('aria-label', 'Face-down card');
    }
  }
}
