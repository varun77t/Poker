import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { actions, enterName, expectOnlyOwnCardsVisible, handNumber, playUntilHand, seatOf } from './helpers';

/**
 * Three friends, each in their own browser context (separate storage, so separate sessions):
 * create a room, join from the invite link, play several hands, and one of them drops out and
 * comes back mid-game.
 */

async function newPlayer(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test('create, join by invite link, play hands, disconnect and reconnect', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const bob = await newPlayer(browser);
  const carol = await newPlayer(browser);

  // Alice creates a room with the default settings.
  await alice.page.goto('/');
  await enterName(alice.page, 'Alice');
  await alice.page.getByRole('button', { name: 'Create a room' }).click();
  await expect(alice.page).toHaveURL(/\/create$/);
  await alice.page.getByRole('button', { name: 'Create room' }).click();
  await expect(alice.page).toHaveURL(/\/room\/[A-Z0-9]{6}$/);
  const code = (await alice.page.getByTestId('room-code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  // Bob and Carol open the invite link, give a name, and take a seat.
  for (const [player, name] of [
    [bob, 'Bob'],
    [carol, 'Carol'],
  ] as const) {
    await player.page.goto(`/room/${code}`);
    await player.page.getByLabel('Your name').fill(name);
    await player.page.getByRole('button', { name: 'Take a seat' }).click();
    await expect(player.page.getByText(`Waiting for Alice to start the game.`)).toBeVisible();
  }
  await expect(alice.page.getByTestId('player-count')).toContainText('3 / 5');
  for (const name of ['Bob', 'Carol']) await expect(seatOf(alice.page, name)).toBeVisible();

  // Alice starts; everyone is dealt in and sees only their own cards.
  await alice.page.getByRole('button', { name: 'Start game' }).click();
  const pages = [alice.page, bob.page, carol.page];
  for (const page of pages) await expect(page.locator('header').getByText(/^Hand\s+1$/)).toBeVisible();
  await expectOnlyOwnCardsVisible(alice.page, ['Bob', 'Carol']);
  await expectOnlyOwnCardsVisible(bob.page, ['Alice', 'Carol']);

  // A few hands, everyone checking or calling.
  await playUntilHand(pages, 3);

  // Carol drops out (her tab closes). The others see her as away, and the game keeps going.
  const carolStack = (await seatOf(alice.page, 'Carol').textContent()) ?? '';
  expect(carolStack).toMatch(/\d/);
  await carol.page.close();
  await expect(seatOf(alice.page, 'Carol')).toContainText('Away', { timeout: 20_000 });

  // She comes back in a new tab of the same browser: same session, same seat, back in the game.
  carol.page = await carol.context.newPage();
  await carol.page.goto(`/room/${code}`);
  await expect(carol.page.locator('header').getByText(/^Hand\s+\d+$/)).toBeVisible();
  await expect(seatOf(carol.page, 'You')).toBeVisible();
  await expect(seatOf(alice.page, 'Carol')).not.toContainText('Away');
  await expect(actions(carol.page)).toBeVisible();

  // And play carries on with her.
  const now = await handNumber(alice.page);
  await playUntilHand([alice.page, bob.page, carol.page], now + 1);

  for (const player of [alice, bob, carol]) await player.context.close();
});
