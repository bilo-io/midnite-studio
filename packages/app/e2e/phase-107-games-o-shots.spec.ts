import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, setTheme, settle, SHOT_VIEWPORTS, shotPath, type MockFixtures } from './shots-helper';

/**
 * Phase 107 Theme O — PR screenshots of the runner toolbar's Playtests menu
 * (not assertions: `playtests-menu.test.tsx` and `playtest.test.ts` own those).
 * Run with `MSTUDIO_SHOTS=1`. Results are the mock bridge's fixtures; nothing runs.
 */
const OUT = '../../docs/screenshots/phase-107-games-o';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 60_000 });
test.use({ viewport: SHOT_VIEWPORTS.board });

const RAN = '2026-10-07T10:00:00.000Z';
const GAMES: MockFixtures = {
  ...fixtures,
  games: {
    resolvedRoot: '/Users/you/Midnite Games',
    list: [
      { gameId: 'g0a1b2c3d4e5f', name: 'Moon Rover', path: '/Users/you/Midnite Games/moon-rover', engine: 'phaser', dimension: '2d', starter: 'top-down' },
    ],
    playtests: [
      {
        name: 'broken',
        file: 'playtests/broken.json',
        valid: false,
        issue: 'asserts.0.op: Invalid enum value. Expected \'eq\' | \'ne\' | \'lt\' | \'gt\' | \'exists\' | \'approx\', received \'equals\'',
        last: null,
      },
      {
        name: 'jump-gap',
        file: 'playtests/jump-gap.json',
        valid: true,
        issue: null,
        last: {
          name: 'jump-gap',
          passed: false,
          ranAt: RAN,
          frames: 240,
          ms: 1180,
          results: [
            { assertIndex: 0, frame: 120, kind: 'state', ok: true, status: 'pass', message: '$.scene = "level"' },
            { assertIndex: 1, frame: 240, kind: 'state', ok: false, status: 'fail', message: '$.player.position[1] is 612, expected < 480', screenshot: 'playtests/results/jump-gap-1.png' },
            { assertIndex: 2, frame: 240, kind: 'frame', ok: false, status: 'fail', message: '4.21% of pixels changed, over the 1.00% tolerance.', screenshot: 'playtests/results/jump-gap-2.png', diff: 'playtests/results/jump-gap-2-diff.png', changedFraction: 0.0421 },
          ],
        },
      },
      {
        name: 'smoke',
        file: 'playtests/smoke.json',
        valid: true,
        issue: null,
        last: {
          name: 'smoke',
          passed: true,
          ranAt: RAN,
          frames: 180,
          ms: 640,
          results: [
            { assertIndex: 0, frame: 180, kind: 'state', ok: true, status: 'pass', message: '$.scene = "level"' },
            { assertIndex: 1, frame: 180, kind: 'state', ok: true, status: 'pass', message: '$.player.position[0] = 630 > 300' },
          ],
        },
      },
      { name: 'walk-replay', file: 'playtests/walk-replay.json', valid: true, issue: null, last: null },
    ],
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
  test(`Playtests menu with results (${theme})`, async ({ page }) => {
    await openGame(page, theme);
    await page.getByRole('button', { name: 'Playtests' }).click();
    await expect(page.getByRole('list', { name: 'Play-tests' })).toBeVisible();
    await settle(page, 300);
    await page.screenshot({ path: shotPath(OUT, `games-playtests-menu-${theme}.png`) });
  });
}
