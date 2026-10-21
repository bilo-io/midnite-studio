import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, setTheme, settle, SHOT_VIEWPORTS, shotPath, type MockFixtures } from './shots-helper';

/**
 * Phase 107 Theme P — PR screenshots of the Games toolbar's export menu and its result toast
 * (not assertions: `game-export-bar.test.tsx` and desktop's `export.test.ts` own those).
 * Run with `MSTUDIO_SHOTS=1`. The export itself is the mock bridge's answer; nothing is written.
 */
const OUT = '../../docs/screenshots/phase-107-games-p';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 60_000 });
test.use({ viewport: SHOT_VIEWPORTS.board });

const GAMES: MockFixtures = {
  ...fixtures,
  games: {
    resolvedRoot: '/Users/you/Midnite Games',
    list: [{ gameId: 'g0a1b2c3d4e5f', name: 'Moon Rover', path: '/Users/you/Midnite Games/moon-rover', engine: 'phaser', dimension: '2d', starter: 'platformer' }],
    exportResult: { ok: true, warnings: ['This file is 63 MB; browsers may be slow to open it.'] },
  },
};

async function openGame(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await installMockBridge(page, GAMES);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Media', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await expect(page.getByRole('tablist', { name: 'Media' })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await setTheme(page, theme, { settleMs: 200 });
  await page.getByRole('tab', { name: 'Games' }).click();
  await page.getByRole('button', { name: /Moon Rover/ }).click();
}

for (const theme of ['dark', 'light'] as const) {
  test(`export menu (${theme})`, async ({ page }) => {
    await openGame(page, theme);
    await page.getByRole('button', { name: 'Export format' }).click();
    await expect(page.getByText('Static folder')).toBeVisible();
    await settle(page, 300);
    await page.screenshot({ path: shotPath(OUT, `games-export-menu-${theme}.png`) });
  });

  test(`export result with a size warning (${theme})`, async ({ page }) => {
    await openGame(page, theme);
    await page.getByRole('button', { name: 'Export Single HTML file' }).click();
    await expect(page.getByText(/browsers may be slow to open it/)).toBeVisible();
    await settle(page, 300);
    await page.screenshot({ path: shotPath(OUT, `games-export-result-${theme}.png`) });
  });
}
