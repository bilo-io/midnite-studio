import * as sharedModule from '@midnite/studio-shared';
import { expect, type Page, test } from '@playwright/test';

import { writeTexturedGlb } from '../../desktop/src/main/media/model/sf3d/glb-textured';
import { encodePng } from '../../desktop/src/main/media/model/sf3d/png';
import { clickRailLink, fixtures, installMockBridge, type MockFixtures, settle, shotPath } from './shots-helper';

/**
 * Phase 103 Theme J — an SF3D-style result imported as an `asset` part, then auto-rigged, weighted and
 * animated, for the PR. Run with `MSTUDIO_SHOTS=1`. Needs a real browser for WebGL: the point is that the
 * imported mesh's baked texture actually draws in the viewport.
 *
 * No SF3D inference is involved: the `.glb` is a synthetic figure (the kernel's own ellipsoids merged into
 * one mesh, planar uvs over an 8×8 checker), written by the same textured-glb writer the SF3D tier uses.
 */
const OUT = '../../docs/screenshots/phase-103-sf3d-asset-rig';
// Under Playwright the shared package loads as CommonJS, whose `export *` re-exports are invisible to
// named ESM imports; they are all on its default export. Typecheck reads the source, which has none.
const shared = (sharedModule as unknown as { default?: typeof sharedModule }).default ?? sharedModule;
const { buildScene, modelAssetHash, ModelSpecSchema } = shared;

const blob = (name: string, radii: number[], position: number[], rotation = [0, 0, 0]) => ({ name, shape: 'ellipsoid', radii, position, rotation, segments: 32 });
const FIGURE = [
  blob('left leg', [0.08, 0.42, 0.09], [0.12, 0.42, 0]),
  blob('right leg', [0.08, 0.42, 0.09], [-0.12, 0.42, 0]),
  blob('left foot', [0.06, 0.04, 0.12], [0.12, 0.04, 0.05]),
  blob('right foot', [0.06, 0.04, 0.12], [-0.12, 0.04, 0.05]),
  blob('hips', [0.19, 0.12, 0.12], [0, 0.86, 0]),
  blob('torso', [0.2, 0.36, 0.13], [0, 1.12, 0]),
  blob('neck', [0.05, 0.06, 0.05], [0, 1.5, 0]),
  blob('head', [0.11, 0.13, 0.12], [0, 1.66, 0]),
  blob('left arm', [0.05, 0.34, 0.05], [0.37, 1.12, 0], [0, 0, 20]),
  blob('right arm', [0.05, 0.34, 0.05], [-0.37, 1.12, 0], [0, 0, -20]),
];

/** The figure as SF3D would hand it back: one mesh around the origin, with a baked checker atlas. */
function figureGlb(): { glb: Buffer; triangles: number; vertices: number } {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const part of buildScene(ModelSpecSchema.parse({ name: 'figure', parts: FIGURE }))) {
    const base = positions.length / 3;
    for (let i = 0; i < part.positions.length; i += 3) positions.push(part.positions[i]!, part.positions[i + 1]! - 0.9, part.positions[i + 2]!);
    for (const index of part.indices) indices.push(base + index);
  }
  const uvs = new Float32Array(indices.length * 2);
  for (let i = 0; i < indices.length; i += 1) {
    const v = indices[i]! * 3;
    uvs[i * 2] = (positions[v]! + 0.6) / 1.2;
    uvs[i * 2 + 1] = 1 - (positions[v + 1]! + 0.9) / 1.8;
  }
  const rgba = new Uint8Array(8 * 8 * 4);
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) rgba.set((x + y) % 2 === 0 ? [240, 140, 40, 255] : [30, 150, 160, 255], (y * 8 + x) * 4);
  const glb = writeTexturedGlb({
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    uvs,
    png: encodePng(rgba, 8, 8),
    name: 'figure',
    roughness: 0.6,
    metalness: 0,
  });
  return { glb, triangles: indices.length / 3, vertices: positions.length / 3 };
}

const { glb, triangles, vertices } = figureGlb();
// The sidecar `importAsset` writes: one white asset part, centred and stood on the ground.
const sidecar = JSON.stringify({
  version: 1,
  name: 'figure',
  prompt: 'A standing figure',
  engine: 'sf3d',
  spec: {
    name: 'Figure',
    parts: [
      {
        id: 'p1',
        name: 'mesh',
        shape: 'asset',
        src: 'figure.asset.glb',
        hash: modelAssetHash(new Uint8Array(glb)),
        vertices,
        triangles,
        position: [0, 0.9, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: '#ffffff',
        material: { metalness: 0, roughness: 0.6 },
      },
    ],
  },
  createdAt: '2026-10-04T00:00:00.000Z',
});
const DATA: MockFixtures = {
  ...fixtures,
  media: { files: { 'model:props': { 'figure.obj': 'o x', 'figure.mtl': 'x', 'figure.fbx': 'x', 'figure.json': sidecar } } },
};

async function openModels(page: Page): Promise<void> {
  // The editor fetches the `.glb` over `mstudio-file://`, which only Electron serves: answer it here.
  await page.addInitScript((base64: string) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const real = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith('.asset.glb')) return Promise.resolve(new Response(bytes, { status: 200, headers: { 'content-type': 'model/gltf-binary' } }));
      return real(input, init);
    };
  }, glb.toString('base64'));
  await installMockBridge(page, DATA);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 120_000 });
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: 'Models' }).click();
    await expect(page.getByRole('tab', { name: 'Models', selected: true })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 5000 });
  await expect(page.getByTestId('model-canvas')).toBeVisible({ timeout: 30_000 });
  await settle(page, 1200);
  await page.getByRole('button', { name: 'Reset camera' }).click();
  await settle(page, 500);
}

const panelTab = (page: Page, name: string) => page.getByRole('tablist', { name: 'Part panels' }).getByRole('tab', { name });

test.describe('phase 103 SF3D asset part screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: { width: 1920, height: 1120 } });

  test('imported asset part: outliner and texture, auto-rig, weights, a clip playing', async ({ page }) => {
    test.setTimeout(180_000);
    await openModels(page);

    // The asset part in the outliner, its baked texture in the viewport.
    await expect(page.getByRole('list', { name: 'Parts' }).getByText('mesh', { exact: true })).toBeVisible();
    await page.getByRole('list', { name: 'Parts' }).getByText('mesh', { exact: true }).click();
    await settle(page, 600);
    await page.screenshot({ path: shotPath(OUT, 'asset-part.png') });

    // Rig tab: biped, Auto-rig, the skeleton drawn over the mesh.
    await panelTab(page, 'Rig').click();
    await page.getByLabel('Anatomy').selectOption('biped');
    await page.getByRole('button', { name: /Auto-rig|Re-rig/ }).click();
    await expect(page.getByTestId('bone-outliner')).toBeVisible();
    await page.getByTestId('bone-outliner').getByRole('button', { name: 'leftUpperArm' }).click();
    await settle(page, 600);
    await page.screenshot({ path: shotPath(OUT, 'auto-rig.png') });

    // Per-vertex weights of the picked bone.
    await page.getByRole('button', { name: 'Weights' }).click();
    await settle(page, 600);
    await page.screenshot({ path: shotPath(OUT, 'weights.png') });
    await page.getByRole('button', { name: 'Weights' }).click();

    // Animation tab: add a walk and play it.
    await panelTab(page, 'Animation').click();
    await page.getByLabel('Add clip').selectOption('walk');
    await page.getByTestId('clip-list').getByRole('button', { name: /walk/ }).click();
    await page.getByRole('toolbar', { name: 'Timeline' }).getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByRole('toolbar', { name: 'Timeline' }).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await page.waitForTimeout(450);
    await page.screenshot({ path: shotPath(OUT, 'clip-playing.png') });
  });
});
