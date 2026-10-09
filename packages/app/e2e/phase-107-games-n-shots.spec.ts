import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, setTheme, settle, SHOT_VIEWPORTS, shotPath, type MockFixtures } from './shots-helper';

/**
 * Phase 107 Theme N — PR screenshots of the asset bridge (not assertions:
 * `game-assets-panel.test.tsx` and `asset-bridge.test.ts` own those). Run with `MSTUDIO_SHOTS=1`.
 * Sources and sync state are the mock bridge's fixtures; nothing is copied.
 */
const OUT = '../../docs/screenshots/phase-107-games-n';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 60_000 });
test.use({ viewport: SHOT_VIEWPORTS.board });

const IMPORTED = '2026-10-07T10:00:00.000Z';
const GAMES: MockFixtures = {
  ...fixtures,
  games: {
    resolvedRoot: '/Users/you/Midnite Games',
    list: [
      { gameId: 'g0a1b2c3d4e5f', name: 'Moon Rover', path: '/Users/you/Midnite Games/moon-rover', engine: 'phaser', dimension: '2d', starter: 'top-down' },
      { gameId: 'g1f2e3d4c5b6a', name: 'Sky Fort', path: '/Users/you/Midnite Games/sky-fort', engine: 'three', dimension: '3d' },
    ],
    assetSync: [
      { name: 'hero', kind: 'sprite', state: 'current', importedAt: IMPORTED },
      { name: 'grass', kind: 'tileset', state: 'changed', importedAt: IMPORTED },
      { name: 'theme', kind: 'audio', state: 'changed', importedAt: IMPORTED },
      { name: 'dunes', kind: 'terrain', state: 'missing', importedAt: IMPORTED },
    ],
    assetSources: {
      sprite: [
        {
          repoPath: '/Users/you/Dev/demo-world',
          name: 'demo-world',
          items: [
            { path: 'characters/hero-20261007-120000', label: 'hero-20261007-120000', kind: 'sprite', bytes: 0 },
            { path: 'characters/slime-20261006-093000', label: 'slime-20261006-093000', kind: 'sprite', bytes: 0 },
            { path: 'tilesets/grass-20261005-101500', label: 'grass-20261005-101500', kind: 'tileset', bytes: 0 },
            { path: 'maps/level-1-20261007-141000', label: 'level-1-20261007-141000', kind: 'map', bytes: 0 },
          ],
        },
      ],
    },
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
  await expect(page.getByTestId('game-assets')).toBeVisible();
}

for (const theme of ['dark', 'light'] as const) {
  test(`asset picker (${theme})`, async ({ page }) => {
    await openGame(page, theme);
    await page.getByRole('button', { name: 'Import asset' }).click();
    await expect(page.getByRole('button', { name: 'Import hero-20261007-120000' })).toBeVisible();
    await settle(page, 300);
    await page.screenshot({ path: shotPath(OUT, `games-asset-picker-${theme}.png`) });
  });
}

test('changed sources: badge in the list and Re-import (dark)', async ({ page }) => {
  await openGame(page, 'dark');
  await expect(page.getByTestId('game-assets-badge').first()).toHaveText('2 assets changed');
  await expect(page.getByRole('button', { name: 'Re-import' })).toBeVisible();
  await settle(page, 300);
  await page.screenshot({ path: shotPath(OUT, 'games-assets-changed-dark.png') });
});
