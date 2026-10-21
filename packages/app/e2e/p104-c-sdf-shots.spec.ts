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
 * Phase 104 Theme C screenshots: the SDF tab building a bust from signed-distance primitives. Run with
 * `MSTUDIO_SHOTS=1`. Needs a real browser for the WebGL viewport and the inlined sculpt worker.
 */
const OUT = '../../docs/screenshots/p104-c';
const sidecar = JSON.stringify({
  version: 1,
  name: 'bust',
  prompt: 'A sculpted bust on a plinth',
  engine: 'ollama:qwen2.5-coder:7b',
  spec: {
    name: 'Bust',
    parts: [
      {
        name: 'plinth',
        shape: 'box',
        size: [1.4, 0.2, 1],
        position: [0, -1.35, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: '#5c5f66',
      },
    ],
  },
  createdAt: '2026-10-06T00:00:00.000Z',
});
const DATA: MockFixtures = {
  ...fixtures,
  media: {
    files: {
      'model:busts': { 'bust.obj': 'o x', 'bust.mtl': 'x', 'bust.fbx': 'x', 'bust.json': sidecar },
    },
  },
};

const baked = (page: Page) =>
  expect(page.getByRole('group', { name: 'SDF', exact: true }).getByRole('status')).toHaveText(
    /Baked [\d,]+ vertices/,
    { timeout: 60_000 },
  );

async function setNumber(page: Page, label: string, value: number): Promise<void> {
  const field = page.getByLabel(label, { exact: true });
  await field.fill(String(value));
  await field.press('Enter');
  await baked(page);
}

async function addPrimitive(page: Page, kind: string, name: string): Promise<void> {
  await page.getByLabel('Add primitive').selectOption(kind);
  await baked(page);
  const field = page.getByLabel('Name', { exact: true });
  await field.fill(name);
  await field.press('Enter');
  await baked(page);
}

test.describe('phase 104 theme C screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: SHOT_VIEWPORTS.wide });

  test('SDF modelling', async ({ page }) => {
    test.setTimeout(600_000);
    await installMockBridge(page, DATA);
    // The mock bridge has no disk: let the mesh channel accept the write so each bake completes.
    await page.addInitScript(() => {
      const api = (
        window as unknown as {
          midniteStudio?: { media?: { model?: { mesh?: Record<string, unknown> } } };
        }
      ).midniteStudio;
      const model = api?.media?.model;
      if (model)
        model.mesh = {
          read: async () => ({ ok: false, kind: 'error', message: 'none' }),
          write: async () => ({ ok: true, value: {} }),
          appendOps: async () => ({ ok: true, value: {} }),
          readOps: async () => ({ ok: true, value: { entries: [] } }),
        };
    });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({
      timeout: 120_000,
    });
    await expect(async () => {
      await clickRailLink(page, 'Media');
      await page.getByRole('tab', { name: 'Models' }).click();
      await expect(page.getByRole('tab', { name: 'Models', selected: true })).toBeVisible({
        timeout: 500,
      });
    }).toPass({ timeout: 5000 });
    await expect(page.getByTestId('model-canvas')).toBeVisible({ timeout: 30_000 });
    await settle(page, 800);

    await page.getByRole('tab', { name: 'SDF' }).click();
    await expect(page.getByRole('button', { name: 'New SDF shape' })).toBeVisible();
    await settle(page, 300);
    await page.screenshot({ path: shotPath(OUT, 'sdf-tab-start.png') });

    // Head: the starting sphere, made an egg.
    await page.getByRole('button', { name: 'New SDF shape' }).click();
    await baked(page);
    await page.getByRole('button', { name: /^body/ }).click();
    await page.getByLabel('Name', { exact: true }).fill('cranium');
    await page.getByLabel('Name', { exact: true }).press('Enter');
    await baked(page);
    await setNumber(page, 'Radius', 0.42);

    await addPrimitive(page, 'ellipsoid', 'jaw');
    await setNumber(page, 'Radii X', 0.3);
    await setNumber(page, 'Radii Y', 0.22);
    await setNumber(page, 'Radii Z', 0.3);
    await setNumber(page, 'Position Y', -0.28);
    await setNumber(page, 'Position Z', 0.08);

    await addPrimitive(page, 'sphere', 'nose');
    await setNumber(page, 'Radius', 0.07);
    await setNumber(page, 'Position Y', -0.08);
    await setNumber(page, 'Position Z', 0.42);

    await addPrimitive(page, 'capsule', 'neck');
    await setNumber(page, 'Radius', 0.16);
    await setNumber(page, 'Height', 0.3);
    await setNumber(page, 'Position Y', -0.62);

    await addPrimitive(page, 'ellipsoid', 'shoulders');
    await setNumber(page, 'Radii X', 0.62);
    await setNumber(page, 'Radii Y', 0.24);
    await setNumber(page, 'Radii Z', 0.32);
    await setNumber(page, 'Position Y', -1.02);

    // Eyes: one socket, mirrored, carved out of the cranium.
    await page.getByRole('button', { name: /^cranium/ }).click();
    await page.getByLabel('Wrap node').selectOption('subtract');
    await baked(page);
    await setNumber(page, 'Blend k', 0.04);
    await addPrimitive(page, 'sphere', 'eye socket');
    await setNumber(page, 'Radius', 0.075);
    await setNumber(page, 'Position X', 0.15);
    await setNumber(page, 'Position Y', 0.04);
    await setNumber(page, 'Position Z', 0.38);
    await page.getByLabel('Wrap node').selectOption('mirror');
    await baked(page);

    // Soften every seam between the roots, then bake fine.
    // The new mirror is selected; picking it again clears the selection and shows the root blend.
    await page.getByRole('button', { name: /^mirror 1/ }).click();
    await page.getByLabel('Root blend', { exact: true }).fill('0.12');
    await page.getByLabel('Root blend', { exact: true }).press('Enter');
    await baked(page);
    const status = page.getByRole('group', { name: 'SDF', exact: true }).getByRole('status');
    const bakeAt = async (resolution: string) => {
      await page.getByLabel('Bake detail').selectOption(resolution);
      await page.getByRole('button', { name: 'Bake', exact: true }).click();
      await expect(status).toHaveText(new RegExp(`at ${resolution}³`), { timeout: 120_000 });
    };
    const shoot = async (file: string) => {
      await page.getByRole('button', { name: 'Reset camera' }).click();
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.mouse.move(900, 400);
      await settle(page, 1200);
      await page.screenshot({ path: shotPath(OUT, file) });
    };

    // A draft bake in wireframe shows the surface-nets topology; then a fine bake, solid.
    await bakeAt('64');
    await page.getByRole('button', { name: /^Shading:/ }).click();
    await page.getByRole('option', { name: 'Wireframe' }).click();
    await shoot('sdf-bust-wireframe.png');
    await page.getByRole('button', { name: /^Shading:/ }).click();
    await page.getByRole('option', { name: 'Solid' }).click();
    await bakeAt('192');
    await page.getByRole('button', { name: /^nose/ }).click();
    await shoot('sdf-bust-solid.png');
  });
});
