import { expect, test } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, setTheme, settle, SHOT_VIEWPORTS, shotPath, type MockFixtures } from './shots-helper';

/** PR screenshot of the runner toolbar's Juice popover (not an assertion; `game-juice-menu.test.tsx` owns those). `MSTUDIO_SHOTS=1`. */
const OUT = '../../docs/screenshots/adhoc-game-3d-core';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 400_000 });
test.use({ viewport: SHOT_VIEWPORTS.board });

const GAMES: MockFixtures = {
  ...fixtures,
  games: {
    resolvedRoot: '/Users/you/Midnite Games',
    list: [{ gameId: 'g1f2e3d4c5b6a', name: 'Sky Fort', path: '/Users/you/Midnite Games/sky-fort', engine: 'three', dimension: '3d' }],
    juice: { enabled: true, intensity: 1.25, shake: true, flash: false, particles: true, postfx: true, volume: 0.6 },
  },
};

for (const theme of ['dark', 'light'] as const) {
  test(`Juice popover (${theme})`, async ({ page }) => {
    await installMockBridge(page, GAMES);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: 'Media', exact: true })).toBeVisible({ timeout: 120_000 });
    await expect(async () => {
      await clickRailLink(page, 'Media');
      await expect(page.getByRole('tablist', { name: 'Media' })).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 10_000 });
    await setTheme(page, theme, { settleMs: 200 });
    await page.getByRole('tab', { name: 'Games' }).click();
    await page.getByRole('button', { name: /Sky Fort/ }).click();
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await page.evaluate(() => {
      (window as unknown as { __mstudioMockGames: { runState: (e: unknown) => void } }).__mstudioMockGames.runState({ gameId: 'g1f2e3d4c5b6a', runId: 'r1', state: 'running' });
    });
    await page.getByRole('button', { name: 'Juice' }).click();
    await expect(page.getByRole('slider', { name: 'Intensity' })).toBeVisible();
    await settle(page, 300);
    await page.screenshot({ path: shotPath(OUT, `juice-popover-${theme}.png`) });
  });
}
