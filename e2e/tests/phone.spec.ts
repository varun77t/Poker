import { expect, test, type Page } from '@playwright/test';
import { actions, enterName, handNumber, playUntilHand } from './helpers';

// An iPhone 14 Pro's Safari window (393 x 660 inside the browser bars), with touch.
test.use({ viewport: { width: 393, height: 660 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

/** Nothing on the page reaches past the screen's sides. */
async function expectNoSideOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Every seat's plaque, and the action panel, sit inside the screen. */
async function expectTableOnScreen(page: Page): Promise<void> {
  const { width, height } = page.viewportSize()!;
  for (const plaque of await page.locator('[data-seat] [role="group"]').all()) {
    const box = (await plaque.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
  }
  const panel = (await actions(page).boundingBox())!;
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(width);
  expect(panel.y + panel.height).toBeLessThanOrEqual(height);
}

/** A phone player against the bots: every screen fits, and the game is played by tapping. */
test('play against bots on a phone', async ({ page }) => {
  await page.goto('/');
  await expectNoSideOverflow(page);
  await enterName(page, 'Pocket');
  await page.getByRole('button', { name: 'Play against bots' }).tap();
  await expect(page).toHaveURL(/\/room\/[A-Z0-9]{6}$/);

  await expect(page.getByTestId('player-count')).toContainText('4 / 5');
  await expect(page.getByRole('button', { name: /invite link/ })).toBeVisible();
  await expectNoSideOverflow(page);
  await page.getByRole('button', { name: 'Start game' }).tap();

  await expect(actions(page)).toBeVisible();
  await expect.poll(() => handNumber(page)).toBeGreaterThanOrEqual(1);
  await expectTableOnScreen(page);

  await playUntilHand([page], 3);

  // Turned sideways, the same table and controls still fit.
  await page.setViewportSize({ width: 844, height: 390 });
  await expectTableOnScreen(page);
  await page.setViewportSize({ width: 393, height: 660 });

  await page.getByRole('button', { name: 'End game' }).tap();
  await page.getByRole('group', { name: 'End the game?' }).getByRole('button', { name: 'End game' }).tap();
  const standings = page.getByRole('heading', { name: 'Final standings' });
  await expect(async () => {
    const call = actions(page).getByRole('button', { name: /^(Check|Call)/ });
    if (await call.isVisible()) await call.tap({ timeout: 1000 }).catch(() => undefined);
    await expect(standings).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 120_000 });
  await expectNoSideOverflow(page);
});
