import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, setTheme, settle, SHOT_VIEWPORTS, shotPath, type MockFixtures } from './shots-helper';

/**
 * Phase 107 Theme H — PR screenshots of the starter gallery with the four 2D
 * genre rows now creatable (not assertions: `game-gallery.bridge.test.tsx` owns
 * those). Run with `MSTUDIO_SHOTS=1`.
 */
const OUT = '../../docs/screenshots/phase-107-games-h';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 60_000 });
test.use({ viewport: SHOT_VIEWPORTS.board });

async function openGames(page: Page, data: MockFixtures, theme: 'dark' | 'light'): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Media', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await expect(page.getByRole('tablist', { name: 'Media' })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await setTheme(page, theme, { settleMs: 200 });
  await page.getByRole('tab', { name: 'Games' }).click();
}

const EMPTY: MockFixtures = { ...fixtures, games: { list: [], resolvedRoot: '/Users/you/Midnite Games' } };

for (const theme of ['dark', 'light'] as const) {
  test(`2D gallery with genre cells enabled (${theme})`, async ({ page }) => {
    await openGames(page, EMPTY, theme);
    await page.getByPlaceholder('Moon Rover').fill('Iron Front');
    await page.getByRole('button', { name: 'RTS, Isometric' }).click();
    await settle(page, 300);
    await page.screenshot({ path: shotPath(OUT, `gallery-2d-genres-${theme}.png`) });
  });
}
