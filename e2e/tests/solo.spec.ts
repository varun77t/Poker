import { expect, test } from '@playwright/test';
import { enterName, expectOnlyOwnCardsVisible, handNumber, playUntilHand, seatOf } from './helpers';

/** One person plays against the three Medium bots from "Play against bots", using the C key. */
test('play against bots', async ({ page }) => {
  await page.goto('/');
  await enterName(page, 'Solo');
  await page.getByRole('button', { name: 'Play against bots' }).click();
  await expect(page).toHaveURL(/\/room\/[A-Z0-9]{6}$/);

  // The lobby is the table: three bots already seated.
  await expect(page.getByTestId('player-count')).toContainText('4 / 5');
  for (const bot of ['Ace Bot', 'King Bot', 'Queen Bot']) await expect(seatOf(page, bot)).toContainText('Medium bot');

  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('header').getByText(/^Hand\s+1$/)).toBeVisible();
  await expectOnlyOwnCardsVisible(page, ['Ace Bot', 'King Bot', 'Queen Bot']);
  await expect(page.getByRole('complementary', { name: 'Your hand' })).toBeVisible();

  // The bots act on their own; the player answers with the keyboard shortcut.
  await playUntilHand([page], 3, { useKeys: true });
  expect(await handNumber(page)).toBeGreaterThanOrEqual(3);

  // The host ends the game. The hand in progress is played out first, so keep answering until it is over.
  await page.getByRole('button', { name: 'End game' }).click();
  await page.getByRole('group', { name: 'End the game?' }).getByRole('button', { name: 'End game' }).click();
  const standings = page.getByRole('heading', { name: 'Final standings' });
  await expect(async () => {
    if (await page.getByText('Your turn.').isVisible()) await page.keyboard.press('c');
    await expect(standings).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 120_000 });
});
