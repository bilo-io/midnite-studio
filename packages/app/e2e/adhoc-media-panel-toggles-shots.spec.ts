import { expect, test } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/** Media floating side-panel toggle screenshots for the PR. Run with `MSTUDIO_SHOTS=1`. */
const OUT = '../../docs/screenshots/adhoc-media-panel-toggles';

const part = (name: string, extra: Record<string, unknown>) => ({
  name,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  color: '#3366cc',
  ...extra,
});
const sidecar = JSON.stringify({
  version: 1,
  name: 'robot',
  prompt: 'A friendly tin robot',
  engine: 'ollama:qwen2.5-coder:7b',
  spec: {
    name: 'Tin robot',
    parts: [
      part('body', { shape: 'box', size: [1.6, 2, 1], position: [0, 1.6, 0], color: '#8a97a8' }),
      part('head', { shape: 'sphere', radius: 0.62, position: [0, 3.1, 0], color: '#c9d2dc' }),
    ],
  },
  createdAt: '2026-10-03T00:00:00.000Z',
});
const DATA: MockFixtures = {
  ...fixtures,
  media: { files: { 'model:robots': { 'tin-robot.obj': 'o x', 'tin-robot.mtl': 'x', 'tin-robot.fbx': 'x', 'tin-robot.json': sidecar } } },
};

async function openTab(page: import('@playwright/test').Page, name: string) {
  await installMockBridge(page, DATA);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 120_000 });
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name }).click();
    await expect(page.getByRole('tab', { name, selected: true })).toBeVisible({ timeout: 4000 });
  }).toPass({ timeout: 45_000 });
  await settle(page, 800);
}

test.describe('media panel toggles screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: SHOT_VIEWPORTS.wide });

  test('images: both buttons, then explorer collapsed', async ({ page }) => {
    test.setTimeout(120_000);
    await openTab(page, 'Images');
    await expect(page.getByRole('button', { name: 'Hide explorer' })).toBeVisible();
    await page.mouse.move(700, 600);
    await page.screenshot({ path: shotPath(OUT, 'images-both.png') });

    await page.getByRole('button', { name: 'Hide explorer' }).click();
    await expect(page.getByRole('button', { name: 'Show explorer' })).toBeVisible();
    await page.mouse.move(700, 600);
    await settle(page, 300);
    await page.screenshot({ path: shotPath(OUT, 'images-explorer-collapsed.png') });
  });

  test('models: composer collapsed', async ({ page }) => {
    test.setTimeout(120_000);
    await openTab(page, 'Models');
    await expect(page.getByTestId('model-canvas')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Hide composer' }).click();
    await expect(page.getByRole('button', { name: 'Show composer' })).toBeVisible();
    await page.mouse.move(700, 600);
    await settle(page, 500);
    await page.screenshot({ path: shotPath(OUT, 'models-composer-collapsed.png') });
  });
});
