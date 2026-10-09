import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 105 Themes C + D screenshots for the PR: the no-heightmap question, the 3D viewport shaded and
 * as a height ramp, and the stats readout. Run with `MSTUDIO_SHOTS=1`; skipped otherwise. Needs a real
 * browser (WebGL canvas, real layout); the behaviour is covered in vitest (`no-heightmap-dialog.test.tsx`,
 * `terrain-panel.bridge.test.tsx`). `mstudio-file://` has no handler in the mock app, so `fetch` is
 * patched to serve a synthetic 129² heightfield for the build files.
 */
const OUT = '../../docs/screenshots/phase-105-terrain-cd';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 120_000 });
test.use({ viewport: SHOT_VIEWPORTS.wide });

const stats = {
  resolution: 129,
  worldSize: 1024,
  vertexCount: 16641,
  triangleCount: 32768,
  chunkCount: 4,
  lodCount: 4,
  buildMs: 212,
  minHeight: 0,
  maxHeight: 300,
  histogram: [820, 1900, 4100, 9100, 15200, 22000, 31000, 40100, 52000, 61000, 70500, 83000, 99000, 120500, 160000, 280000],
  warnings: [],
};

const spec = (extra: Record<string, unknown>) =>
  JSON.stringify({ version: 1, name: 'Dunes', resolution: 129, worldSize: 1024, heightRange: [0, 300], inputs: {}, ...extra });

const built = spec({ noise: { kind: 'ridged', seed: 7 }, seaLevel: 40, lastBuild: { at: '2026-10-04T12:00:00.000Z', buildMs: 212, stats } });

const data = (terrainSpec: string): MockFixtures => ({
  ...fixtures,
  media: { files: { 'terrain:terrains': { 'dunes-20261004-120000/terrain.json': terrainSpec } }, terrain: { stats } },
});

async function openTerrain(page: Page, terrainSpec: string): Promise<void> {
  await installMockBridge(page, data(terrainSpec));
  // A synthetic build: two ridges and a basin, so the shading modes have something to show.
  await page.addInitScript(() => {
    const res = 129;
    const world = 1024;
    const heights = new Float32Array(res * res);
    for (let z = 0; z < res; z += 1) {
      for (let x = 0; x < res; x += 1) {
        const u = x / (res - 1);
        const v = z / (res - 1);
        const ridge = Math.max(0, 1 - Math.abs(u - 0.35 - 0.2 * Math.sin(v * 6)) * 5) * 220;
        const peak = Math.max(0, 1 - Math.hypot(u - 0.75, v - 0.6) * 3.2) * 300;
        heights[z * res + x] = Math.min(300, ridge + peak + 20 * Math.sin(u * 20) * Math.cos(v * 17) + 30);
      }
    }
    const chunks = [];
    const size = world / 2;
    for (let cz = 0; cz < 2; cz += 1) {
      for (let cx = 0; cx < 2; cx += 1) {
        let minY = Infinity;
        let maxY = -Infinity;
        for (let z = 0; z < 65; z += 1) {
          for (let x = 0; x < 65; x += 1) {
            const h = heights[(cz * 64 + z) * res + cx * 64 + x]!;
            minY = Math.min(minY, h);
            maxY = Math.max(maxY, h);
          }
        }
        chunks.push({
          cx,
          cz,
          minY,
          maxY,
          centre: [-world / 2 + cx * size + size / 2, (minY + maxY) / 2, -world / 2 + cz * size + size / 2],
          radius: Math.hypot(size / 2, (maxY - minY) / 2, size / 2),
        });
      }
    }
    const chunksFile = { resolution: res, worldSize: world, heightRange: [0, 300], chunkVerts: 65, chunksPerSide: 2, lodCount: 4, chunks };
    const realFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('mstudio-file://') && url.includes('/build/chunks.json')) return Promise.resolve(new Response(JSON.stringify(chunksFile)));
      if (url.startsWith('mstudio-file://') && url.includes('/build/heights.f32')) return Promise.resolve(new Response(heights.buffer.slice(0)));
      return realFetch(input, init);
    };
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 90_000 });
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: 'Terrain' }).click();
    await expect(page.getByRole('tab', { name: 'Terrain', selected: true })).toBeVisible({ timeout: 2500 });
  }).toPass({ timeout: 45_000 });
  await setTheme(page, 'dark', { settleMs: 200 });
  await page.locator('[data-media-pane="explorer"]').getByRole('button', { name: 'dunes' }).click();
  await expect(page.getByTestId('terrain-panel')).toBeVisible();
}

test('no heightmap asks the question (dark)', async ({ page }) => {
  await openTerrain(page, spec({}));
  await page.getByTestId('terrain-panel').getByRole('button', { name: 'Generate' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'terrain-no-heightmap-dialog-dark.png') });
});

test('noise terrain in the viewport, shaded (dark)', async ({ page }) => {
  await openTerrain(page, built);
  await expect(page.getByTestId('terrain-viewport')).toBeVisible({ timeout: 30_000 });
  await settle(page, 2500);
  await page.screenshot({ path: shotPath(OUT, 'terrain-viewport-shaded-dark.png') });
});

test('height ramp shading with the stats readout (dark)', async ({ page }) => {
  await openTerrain(page, built);
  await expect(page.getByTestId('terrain-viewport')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Shading: Shaded/ }).click();
  await page.getByRole('option', { name: 'Height ramp' }).click();
  await settle(page, 2500);
  await expect(page.getByTestId('terrain-stats')).toBeVisible();
  await page.screenshot({ path: shotPath(OUT, 'terrain-viewport-height-ramp-dark.png') });
});

test('slope shading (dark)', async ({ page }) => {
  await openTerrain(page, built);
  await expect(page.getByTestId('terrain-viewport')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Shading: Shaded/ }).click();
  await page.getByRole('option', { name: 'Slope' }).click();
  await settle(page, 2500);
  await page.screenshot({ path: shotPath(OUT, 'terrain-viewport-slope-dark.png') });
});
