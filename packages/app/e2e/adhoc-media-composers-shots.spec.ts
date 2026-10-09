import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Ad-hoc screenshots: Sprites, Games, and 3D Models composers unified layout
 * with model/engine picker in leading and send button inside gradient container.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise.
 */
const OUT = '../../docs/screenshots/adhoc-media-composers';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 90_000 });
test.use({ viewport: SHOT_VIEWPORTS.wide });

const sheet = (name: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    version: 1,
    kind: 'sheet',
    name,
    prompt: 'A knight in plate armour with a red plume',
    style: 'pixel',
    clips: [
      { name: 'idle', frames: 4, fps: 6, loop: 'loop' },
      { name: 'walk', frames: 8, fps: 10, loop: 'loop' },
      { name: 'attack', frames: 6, fps: 12, loop: 'once' },
    ],
    ...extra,
  });

const GAME_ID = 'g0a1b2c3d4e5f';

const DATA: MockFixtures = {
  ...fixtures,
  media: {
    files: {
      'sprite:characters': {
        'knight-20261004-120000/sprite.json': sheet('Knight'),
      },
    },
  },
  games: {
    resolvedRoot: '/Users/you/Midnite Games',
    list: [
      {
        gameId: GAME_ID,
        name: 'Moon Rover',
        path: '/Users/you/Midnite Games/moon-rover',
        engine: 'phaser',
        dimension: '2d',
        starter: 'top-down',
      },
    ],
  },
};

async function openMedia(page: Page, tab: string): Promise<void> {
  await installMockBridge(page, DATA);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 90_000 });
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: tab }).click();
    await expect(page.getByRole('tab', { name: tab, selected: true })).toBeVisible({ timeout: 2500 });
  }).toPass({ timeout: 45_000 });
  await setTheme(page, 'dark', { settleMs: 200 });
}

test('sprites sheet composer', async ({ page }) => {
  await openMedia(page, 'Sprites');
  await expect(page.getByTestId('sprite-create-panel')).toBeVisible();
  const composer = page.getByTestId('sprite-prompt');
  await expect(composer).toBeVisible();
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'sprites-sheet-composer.png') });
});

test('sprites environment composer', async ({ page }) => {
  await openMedia(page, 'Sprites');
  await page.getByTestId('sprite-create-panel').getByRole('radio', { name: 'Environment' }).click();
  const composer = page.getByTestId('sprite-env-prompt');
  await expect(composer).toBeVisible();
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'sprites-env-composer.png') });
});

test('games iterate composer', async ({ page }) => {
  await openMedia(page, 'Games');
  await page.getByRole('button', { name: /Moon Rover/ }).click();
  await expect(page.getByTestId('game-iterate-panel')).toBeVisible();
  const composer = page.getByTestId('game-prompt');
  await expect(composer).toBeVisible();
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'games-iterate-composer.png') });
});

test('3D models composer', async ({ page }) => {
  await openMedia(page, 'Models');
  await expect(page.getByRole('form', { name: 'Create 3D model' })).toBeVisible();
  const composer = page.getByTestId('model-prompt');
  await expect(composer).toBeVisible();
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'models-composer.png') });
});
