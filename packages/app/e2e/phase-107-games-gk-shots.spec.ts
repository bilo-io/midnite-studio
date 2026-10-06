import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, setTheme, settle, SHOT_VIEWPORTS, shotPath, type MockFixtures } from './shots-helper';

/**
 * Phase 107 Themes G + K — PR screenshots of the starter gallery (not assertions:
 * `game-gallery.bridge.test.tsx` owns those). Run with `MSTUDIO_SHOTS=1`.
 */
const OUT = '../../docs/screenshots/phase-107-games-gk';

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
  test(`2D gallery (${theme})`, async ({ page }) => {
    await openGames(page, EMPTY, theme);
    await page.getByPlaceholder('Moon Rover').fill('Neon Drift');
    await page.getByRole('button', { name: 'No genre, Isometric' }).click();
    await settle(page, 300);
    await page.screenshot({ path: shotPath(OUT, `gallery-2d-${theme}.png`) });
  });
}

test('3D gallery with the five cameras (dark)', async ({ page }) => {
  await openGames(page, EMPTY, 'dark');
  await page.getByPlaceholder('Moon Rover').fill('Arena');
  await page.getByRole('radio', { name: '3D' }).click();
  await page.getByRole('button', { name: 'No genre, Third person' }).click();
  await page.getByLabel('Much further behind').uncheck();
  await settle(page, 300);
  await page.screenshot({ path: shotPath(OUT, 'gallery-3d-dark.png') });
});
