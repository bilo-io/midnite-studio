import { expect, test, type Locator, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Playwright/real-browser: Media ▸ Models' 3D editor. jsdom has no WebGL, so
 * every logic path (reducer, undo/redo, inspector fields, save/export through
 * the bridge) is in vitest (`editor-state.test.ts`, `model-tab.bridge.test.tsx`).
 * What only a real browser can prove, and what these tests do:
 *
 *   - a real WebGL context renders the design and re-renders when state
 *     changes (the canvas pixels differ for selection, wireframe, the
 *     orthographic Top camera and x-ray)
 *   - real pointer picking: a click on the canvas is ray-cast against the
 *     meshes and selects the part under it
 *   - a real pointer drag orbits the camera, and "Reset camera" restores it
 */
test.use({ viewport: { width: 1400, height: 900 }, contextOptions: { reducedMotion: 'reduce' } });

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
  prompt: 'a tin robot',
  engine: 'ollama:qwen2.5-coder:7b',
  spec: {
    name: 'Tin robot',
    // A big centred body so the middle of the canvas is a guaranteed hit.
    parts: [
      part('body', { shape: 'box', size: [2, 3, 1.4], position: [0, 1.5, 0] }),
      part('head', { shape: 'sphere', radius: 0.7, position: [0, 3.7, 0], color: '#ffcc00' }),
      part('foot', { shape: 'cylinder', radiusTop: 0.4, radiusBottom: 0.4, height: 0.2, position: [0, 0.1, 1.4], color: '#cc3333' }),
    ],
  },
  createdAt: '2026-10-03T00:00:00.000Z',
});

const DATA: MockFixtures = {
  ...fixtures,
  media: { files: { 'model:robots': { 'robot.obj': 'o x', 'robot.mtl': 'x', 'robot.fbx': 'x', 'robot.json': sidecar } } },
};

async function openEditor(page: Page): Promise<Locator> {
  await installMockBridge(page, DATA);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 90_000 });
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: 'Models' }).click();
    await expect(page.getByRole('tab', { name: 'Models', selected: true })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 5000 });
  const canvas = page.getByTestId('model-canvas');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  // Let the camera frame the model before anything is compared.
  await page.waitForTimeout(500);
  return canvas;
}

const shot = (canvas: Locator): Promise<Buffer> => canvas.screenshot();

test('the canvas renders the design and redraws for selection and wireframe', async ({ page }) => {
  const canvas = await openEditor(page);
  const solid = await shot(canvas);
  expect(solid.length).toBeGreaterThan(2000);

  await page.getByRole('list', { name: 'Parts' }).getByRole('button', { name: /body/ }).click();
  await page.waitForTimeout(300);
  const selected = await shot(canvas);
  expect(Buffer.compare(solid, selected)).not.toBe(0);

  await page.getByRole('button', { name: /^Shading:/ }).click();
  await page.getByRole('option', { name: 'Wireframe' }).click();
  await page.waitForTimeout(300);
  const wire = await shot(canvas);
  expect(Buffer.compare(selected, wire)).not.toBe(0);

  // The orthographic Top view and x-ray are real camera / blend changes: both must repaint.
  await page.getByRole('button', { name: /^Shading:/ }).click();
  await page.getByRole('option', { name: 'Solid' }).click();
  await page.getByRole('button', { name: /^Projection:/ }).click();
  await page.getByRole('option', { name: 'Top' }).click();
  await page.waitForTimeout(500);
  const top = await shot(canvas);
  expect(Buffer.compare(wire, top)).not.toBe(0);
  await page.getByRole('button', { name: /^X-ray/ }).click();
  await page.waitForTimeout(300);
  expect(Buffer.compare(top, await shot(canvas))).not.toBe(0);
});

test('clicking the model in the canvas picks the part under the pointer', async ({ page }) => {
  const canvas = await openEditor(page);
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('list', { name: 'Parts' }).getByRole('button', { name: /body/ })).toHaveAttribute('aria-current', 'true');
  // Empty space deselects.
  await page.mouse.click(box.x + 6, box.y + 6);
  await expect(page.getByText(/Select a part/)).toBeVisible();
});

test('dragging orbits the camera and Reset camera brings it back', async ({ page }) => {
  const canvas = await openEditor(page);
  const home = await shot(canvas);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 160, box.y + 60, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect(Buffer.compare(home, await shot(canvas))).not.toBe(0);

  await page.getByRole('button', { name: 'Reset camera' }).click();
  await page.waitForTimeout(300);
  expect(Buffer.compare(home, await shot(canvas))).toBe(0);
});
