import { expect, test, type Page } from '@playwright/test';

import {
  clickRailLink,
  fixtures,
  installMockBridge,
  type MockFixtures,
  settle,
  SHOT_VIEWPORTS,
  shotPath,
} from './shots-helper';

/**
 * Phase 104 Theme D screenshots: sculpt mode — a primitive bust converted and sculpted with brushes,
 * X symmetry, the mask and a multires level. Run with `MSTUDIO_SHOTS=1`. Needs a real browser: WebGL
 * for the viewport, the inlined sculpt worker, and real pointer drags on the canvas.
 */
const OUT = '../../docs/screenshots/p104-d';
const part = (p: Record<string, unknown>) => ({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#c9b8a6', ...p });
const sidecar = JSON.stringify({
  version: 1,
  name: 'bust',
  prompt: 'A clay bust to sculpt',
  engine: 'ollama:qwen2.5-coder:7b',
  spec: {
    name: 'Bust',
    parts: [
      part({ name: 'head', shape: 'sphere', radius: 0.42, position: [0, 0.45, 0], scale: [0.9, 1.1, 1] }),
      part({ name: 'jaw', shape: 'sphere', radius: 0.3, position: [0, 0.2, 0.08], scale: [1, 0.8, 1] }),
      part({ name: 'neck', shape: 'capsule', radius: 0.17, height: 0.25, position: [0, -0.05, -0.02] }),
    ],
  },
  createdAt: '2026-10-07T00:00:00.000Z',
});
const DATA: MockFixtures = {
  ...fixtures,
  media: { files: { 'model:busts': { 'bust.obj': 'o x', 'bust.mtl': 'x', 'bust.fbx': 'x', 'bust.json': sidecar } } },
};

/** A drag across the canvas, in page pixels. */
async function stroke(page: Page, points: [number, number][], modifiers: { shift?: boolean; ctrl?: boolean } = {}): Promise<void> {
  if (modifiers.ctrl) await page.keyboard.down('Control');
  if (modifiers.shift) await page.keyboard.down('Shift');
  await page.mouse.move(...points[0]!);
  await page.mouse.down();
  for (let i = 1; i < points.length; i += 1) {
    const [ax, ay] = points[i - 1]!;
    const [bx, by] = points[i]!;
    for (let k = 1; k <= 8; k += 1) await page.mouse.move(ax + ((bx - ax) * k) / 8, ay + ((by - ay) * k) / 8);
  }
  await page.mouse.up();
  if (modifiers.shift) await page.keyboard.up('Shift');
  if (modifiers.ctrl) await page.keyboard.up('Control');
  await settle(page, 250);
}

test.describe('phase 104 theme D screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: SHOT_VIEWPORTS.wide });

  test('sculpt mode', async ({ page }) => {
    test.setTimeout(600_000);
    await installMockBridge(page, DATA);
    // The mock bridge has no disk: keep mesh files in memory so convert → sculpt → save round-trips.
    await page.addInitScript(() => {
      const files = new Map<string, Uint8Array>();
      const api = (window as unknown as { midniteStudio?: { media?: { model?: { mesh?: Record<string, unknown> } } } }).midniteStudio;
      const model = api?.media?.model;
      if (model)
        model.mesh = {
          read: async ({ src }: { src: string }) => (files.has(src) ? { ok: true, value: { data: files.get(src)!.slice() } } : { ok: false, kind: 'error', message: 'missing' }),
          write: async ({ src, data }: { src: string; data: Uint8Array }) => {
            files.set(src, new Uint8Array(data));
            return { ok: true, value: {} };
          },
          appendOps: async () => ({ ok: true, value: {} }),
          readOps: async () => ({ ok: true, value: { entries: [] } }),
        };
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

    // Convert at low detail in the Mesh tab (so a multires level reads in wireframe), then open it in the Sculpt tab.
    await page.getByRole('tab', { name: 'Mesh' }).click();
    await page.getByLabel('Detail', { exact: true }).selectOption('5000');
    await page.getByRole('button', { name: 'Convert to sculpt mesh' }).click();
    await page.getByRole('tab', { name: 'Sculpt' }).click();
    await page.getByRole('button', { name: /^Sculpt / }).click();
    const status = page.getByTestId('sculpt-status');
    await expect(status).toContainText('Sculpting', { timeout: 120_000 });
    // A full-strength brush, and the camera swung round to face the head (orbit is the right button in sculpt mode).
    await page.getByRole('button', { name: 'Reset camera' }).click();
    await page.getByLabel('Strength (Shift+F)', { exact: true }).fill('0.6');
    await page.getByLabel('Strength (Shift+F)', { exact: true }).press('Enter');
    await page.getByLabel('Radius', { exact: true }).fill('36');
    await page.getByLabel('Radius', { exact: true }).press('Enter');
    await settle(page, 800);

    const canvas = page.getByTestId('model-canvas');
    const view = (await canvas.boundingBox())!;
    await page.mouse.move(view.x + view.width / 2, view.y + view.height * 0.9);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(view.x + view.width / 2 + 53, view.y + view.height * 0.9 - 30, { steps: 10 });
    await page.mouse.up({ button: 'right' });
    await settle(page, 600);
    const box = view;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    // The head sits a little above the middle of the canvas after the orbit.
    const hx = cx;
    const hy = cy - 55;
    await page.mouse.move(hx + 40, hy - 20);
    await settle(page, 600);
    await page.screenshot({ path: shotPath(OUT, 'sculpt-mode.png') });

    // X symmetry is on: brows, eye sockets and cheeks are drawn on one side and mirror to the other.
    await stroke(page, [[hx + 18, hy - 32], [hx + 45, hy - 38], [hx + 72, hy - 30]]);
    await stroke(page, [[hx + 40, hy - 5], [hx + 44, hy - 4]], { ctrl: true });
    await page.getByRole('radio', { name: 'Clay' }).click();
    await stroke(page, [[hx, hy - 20], [hx, hy + 30]]);
    await page.getByRole('radio', { name: 'Inflate' }).click();
    await stroke(page, [[hx + 60, hy + 35], [hx + 64, hy + 45]]);
    await page.getByRole('radio', { name: 'Crease' }).click();
    await stroke(page, [[hx - 40, hy + 80], [hx, hy + 86], [hx + 40, hy + 80]]);
    await page.getByRole('radio', { name: 'Smooth' }).click();
    await stroke(page, [[hx - 70, hy - 90], [hx + 70, hy - 90]]);
    await expect(status).toContainText('unsaved');
    await page.mouse.move(box.x + 30, box.y + box.height - 30);
    await settle(page, 800);
    await page.screenshot({ path: shotPath(OUT, 'sculpted-bust.png') });

    // Paint a mask across the shoulders: masked vertices show grey and resist brushes.
    await page.getByRole('radio', { name: 'Mask' }).click();
    await stroke(page, [[hx - 50, hy + 150], [hx + 50, hy + 150]]);
    await stroke(page, [[hx - 60, hy - 100], [hx + 60, hy - 100]]);
    await expect(status).toContainText('last stroke masked');
    await page.mouse.move(box.x + 30, box.y + box.height - 30);
    await settle(page, 800);
    await page.screenshot({ path: shotPath(OUT, 'mask.png') });

    // A multires level, in wireframe.
    await page.getByRole('button', { name: 'Subdivide' }).click();
    await expect(status).toContainText('level 1', { timeout: 120_000 });
    await page.getByRole('button', { name: /^Shading:/ }).click();
    await page.getByRole('option', { name: 'Wireframe' }).click();
    await settle(page, 800);
    await page.screenshot({ path: shotPath(OUT, 'multires-wireframe.png') });
  });
});
