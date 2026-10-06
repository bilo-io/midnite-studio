import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 106 Themes A + C screenshots for the PR: the Sprites tab with its five library groups, the
 * Sheet form with the method picker recommending a method, and the Environment form. Run with
 * `MSTUDIO_SHOTS=1`; skipped otherwise. Behaviour is covered in vitest
 * (`sprite-tab.bridge.test.tsx`, `sprite-method-picker.test.tsx`).
 */
const OUT = '../../docs/screenshots/phase-106-sprites-ac';

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

const data: MockFixtures = {
  ...fixtures,
  media: {
    files: {
      'sprite:characters': {
        'knight-20261004-120000/sprite.json': sheet('Knight'),
        'slime-20261003-093000/sprite.json': sheet('Slime', { prompt: 'A green slime' }),
      },
      'sprite:objects': { 'chest-20261001-101500/sprite.json': sheet('Chest', { category: 'object' }) },
      'sprite:tilesets': { 'meadow-20261002-101500/sprite.json': JSON.stringify({ version: 1, kind: 'tileset', name: 'Meadow' }) },
    },
  },
};

async function openSprites(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 90_000 });
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: 'Sprites' }).click();
    await expect(page.getByRole('tab', { name: 'Sprites', selected: true })).toBeVisible({ timeout: 2500 });
  }).toPass({ timeout: 45_000 });
  await setTheme(page, theme, { settleMs: 200 });
  await expect(page.getByTestId('sprite-create-panel')).toBeVisible();
}

test('sheet form with a selected sprite (dark)', async ({ page }) => {
  await openSprites(page, 'dark');
  await page.locator('[data-media-pane="explorer"]').getByRole('button', { name: 'knight' }).click();
  await expect(page.getByTestId('sprite-overview')).toBeVisible();
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'sprites-sheet-dark.png') });
});

test('top-down with four directions recommends rendering (light)', async ({ page }) => {
  await openSprites(page, 'light');
  const panel = page.getByTestId('sprite-create-panel');
  await panel.getByLabel('Perspective').selectOption('top-down');
  await panel.getByLabel('Directions').selectOption('4');
  await expect(panel.getByTestId('method-recommended')).toBeVisible();
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'sprites-method-rendered-light.png') });
});

test('environment form (dark)', async ({ page }) => {
  await openSprites(page, 'dark');
  await page.getByTestId('sprite-create-panel').getByRole('radio', { name: 'Environment' }).click();
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'sprites-environment-dark.png') });
});
