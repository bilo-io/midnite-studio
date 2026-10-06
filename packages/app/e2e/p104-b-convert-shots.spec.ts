import { expect, test } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/** Phase 104 Theme B screenshots: the Mesh tab and a converted primitive design. Run with `MSTUDIO_SHOTS=1`. */
const OUT = '../../docs/screenshots/p104-b';
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


test.describe('phase 104 theme B screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: SHOT_VIEWPORTS.wide });

  test('convert to sculpt mesh', async ({ page }) => {
    test.setTimeout(180_000);
    await installMockBridge(page, DATA);
    // The mock bridge has no disk: let the mesh channel accept the write so the conversion completes.
    await page.addInitScript(() => {
      const api = (window as unknown as { midniteStudio?: { media?: { model?: { mesh?: Record<string, unknown> } } } }).midniteStudio;
      const model = api?.media?.model;
      if (model) model.mesh = { read: async () => ({ ok: false, kind: 'error', message: 'none' }), write: async () => ({ ok: true, value: {} }), appendOps: async () => ({ ok: true, value: {} }), readOps: async () => ({ ok: true, value: { entries: [] } }) };
    });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 120_000 });
    await expect(async () => {
      await clickRailLink(page, 'Media');
      await page.getByRole('tab', { name: 'Models' }).click();
      await expect(page.getByRole('tab', { name: 'Models', selected: true })).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 5000 });
    await expect(page.getByTestId('model-canvas')).toBeVisible({ timeout: 30_000 });
    await settle(page, 800);

    await page.getByRole('tab', { name: 'Mesh' }).click();
    await expect(page.getByRole('button', { name: 'Convert to sculpt mesh' })).toBeVisible();
    await settle(page, 300);
    await page.screenshot({ path: shotPath(OUT, 'mesh-tab-before.png') });

    await page.getByLabel('Detail').selectOption('80000');
    await page.getByRole('button', { name: 'Convert to sculpt mesh' }).click();
    await expect(page.getByText(/Converted to [\d,]+ vertices/)).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId('mesh-converted')).toBeVisible();
    await settle(page, 1200);
    await page.screenshot({ path: shotPath(OUT, 'converted-solid.png') });

    await page.getByRole('button', { name: /^Shading:/ }).click();
    await page.getByRole('option', { name: 'Wireframe' }).click();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.mouse.move(900, 500);
    await settle(page, 800);
    await page.screenshot({ path: shotPath(OUT, 'converted-wireframe.png') });

    await page.getByRole('button', { name: 'Revert to parts' }).click();
    await settle(page, 800);
    await page.screenshot({ path: shotPath(OUT, 'reverted-to-parts.png') });
  });
});
