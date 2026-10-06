import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, setTheme, settle, SHOT_VIEWPORTS, shotPath, type MockFixtures } from './shots-helper';

/**
 * Phase 107 Theme I — PR screenshots of the 3D starter gallery with the
 * shooter, fighter and soulslike rows now creatable, and the fighter's versus
 * camera note in place of the camera picker (not assertions:
 * `game-gallery.bridge.test.tsx` owns those). Run with `MSTUDIO_SHOTS=1`.
 */
const OUT = '../../docs/screenshots/phase-107-games-i';

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
  test(`3D gallery with the fighter picked (${theme})`, async ({ page }) => {
    await openGames(page, EMPTY, theme);
    await page.getByPlaceholder('Moon Rover').fill('Iron Fist');
    await page.getByRole('radio', { name: '3D' }).click();
    await page.getByRole('button', { name: 'Fighter, Third person' }).click();
    await settle(page, 300);
    await page.screenshot({ path: shotPath(OUT, `gallery-3d-fighter-${theme}.png`) });
  });
}

test('3D gallery with the soulslike picked (dark)', async ({ page }) => {
  await openGames(page, EMPTY, 'dark');
  await page.getByPlaceholder('Moon Rover').fill('Ashen Keep');
  await page.getByRole('radio', { name: '3D' }).click();
  await page.getByRole('button', { name: 'Soulslike, Third person' }).click();
  await settle(page, 300);
  await page.screenshot({ path: shotPath(OUT, 'gallery-3d-soulslike-dark.png') });
});
