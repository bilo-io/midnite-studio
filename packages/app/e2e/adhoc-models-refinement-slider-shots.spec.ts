import { expect, test } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/** Media ▸ Models refinement passes slider screenshot for the PR. Run with `MSTUDIO_SHOTS=1`. */
const OUT = '../../docs/screenshots/adhoc-models-refinement-slider';
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
  prompt: 'A friendly tin robot with a round head and antenna',
  engine: 'ollama:qwen2.5-coder:7b',
  spec: {
    name: 'Tin robot',
    parts: [
      part('body', { shape: 'box', size: [1.6, 2, 1], position: [0, 1.6, 0], color: '#8a97a8' }),
      part('head', { shape: 'sphere', radius: 0.62, position: [0, 3.1, 0], color: '#c9d2dc' }),
      part('eye left', { shape: 'sphere', radius: 0.12, position: [-0.22, 3.18, 0.52], color: '#ffcc00' }),
      part('eye right', { shape: 'sphere', radius: 0.12, position: [0.22, 3.18, 0.52], color: '#ffcc00' }),
      part('antenna', { shape: 'cylinder', radiusTop: 0.03, radiusBottom: 0.03, height: 0.5, position: [0, 3.95, 0], color: '#cc3333' }),
      part('bulb', { shape: 'sphere', radius: 0.09, position: [0, 4.25, 0], color: '#cc3333' }),
      part('arm left', { shape: 'cylinder', radiusTop: 0.14, radiusBottom: 0.14, height: 1.6, position: [-1.1, 1.7, 0], rotation: [0, 0, 12], color: '#6b7a8c' }),
      part('arm right', { shape: 'cylinder', radiusTop: 0.14, radiusBottom: 0.14, height: 1.6, position: [1.1, 1.7, 0], rotation: [0, 0, -12], color: '#6b7a8c' }),
      part('leg left', { shape: 'box', size: [0.45, 1, 0.5], position: [-0.4, 0.5, 0], color: '#6b7a8c' }),
      part('leg right', { shape: 'box', size: [0.45, 1, 0.5], position: [0.4, 0.5, 0], color: '#6b7a8c' }),
    ],
  },
  createdAt: '2026-10-03T00:00:00.000Z',
});
const DATA: MockFixtures = {
  ...fixtures,
  media: { files: { 'model:robots': { 'tin-robot.obj': 'o x', 'tin-robot.mtl': 'x', 'tin-robot.fbx': 'x', 'tin-robot.json': sidecar } } },
};

test.describe('media models refinement slider screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: SHOT_VIEWPORTS.wide });

  test('refinement passes slider with iterative agent', async ({ page }) => {
    test.setTimeout(120_000);

    // Set the model prefs to use Claude (iterative) engine
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'mstudio.media.model-prefs',
        JSON.stringify({ state: { tier: 'procedural', engineId: 'claude', ollamaModel: '', agentModel: 'default', visionModel: '', maxIterations: 10 }, version: 1 }),
      );
    });

    await installMockBridge(page, DATA);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 120_000 });
    await expect(async () => {
      await clickRailLink(page, 'Media');
      await page.getByRole('tab', { name: 'Models' }).click();
      await expect(page.getByRole('tab', { name: 'Models', selected: true })).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 5000 });

    // Wait for the model panel to show (it shows on the right side)
    await expect(page.getByTestId('model-engine-mode')).toBeVisible({ timeout: 10_000 });
    await settle(page, 500);

    // Screenshot the right-hand panel showing the refinement slider
    const panel = page.getByTestId('model-engine-mode').locator('..').locator('..').locator('..');
    await expect(panel).toBeVisible();
    await page.screenshot({ path: shotPath(OUT, 'slider.png') });
  });
});
