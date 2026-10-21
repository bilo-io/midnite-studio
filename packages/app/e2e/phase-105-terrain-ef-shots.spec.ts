import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 105 Themes E + F screenshots for the PR:
 * - Theme E: Satellite drape texture and interactive alignment with onion-skin quad
 * - Theme F: Land-cover classification map, splat materials blend, and class brush palette
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise.
 */
const OUT = '../../docs/screenshots/phase-105-terrain-ef';

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
  buildMs: 380,
  minHeight: 0,
  maxHeight: 300,
  histogram: [820, 1900, 4100, 9100, 15200, 22000, 31000, 40100, 52000, 61000, 70500, 83000, 99000, 120500, 160000, 280000],
  classPercent: {
    water: 12.5,
    tree: 25.0,
    grass: 30.0,
    bare: 10.0,
    rock: 12.5,
    road: 5.0,
    building: 3.0,
    other: 2.0,
  },
  warnings: [],
};

const satelliteInput = {
  file: 'inputs/satellite.png',
  sourceName: 'valley-sat.png',
  width: 512,
  height: 512,
  bitDepth: 8 as const,
};

const spec = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    version: 1,
    name: 'Valley',
    resolution: 129,
    worldSize: 1024,
    heightRange: [0, 300],
    textureSize: 2048,
    inputs: { satellite: satelliteInput },
    alignment: {
      satellite: {
        offset: [0, 0],
        scale: [1, 1],
        rotationDeg: 0,
      },
    },
    classes: {
      k: 6,
      exgThreshold: 0.1,
      rockSlopeDeg: 35,
    },
    lastBuild: { at: '2026-10-04T12:00:00.000Z', buildMs: 380, stats },
    ...extra,
  });

const data = (terrainSpec: string): MockFixtures => ({
  ...fixtures,
  media: { files: { 'terrain:terrains': { 'valley-20261004-120000/terrain.json': terrainSpec } }, terrain: { stats } },
});

async function openTerrain(page: Page, terrainSpec: string): Promise<void> {
  await installMockBridge(page, data(terrainSpec));
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

    // Create a 64x64 color PNG blob
    const makePngBlob = (fill: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) => {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const ctx = c.getContext('2d')!;
      fill(ctx, 64, 64);
      return new Promise<Blob>((res) => c.toBlob((b) => res(b!)));
    };

    const drapePromise = makePngBlob((ctx, w, h) => {
      ctx.fillStyle = '#4a7c59';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#8d99ae';
      ctx.fillRect(w * 0.4, 0, w * 0.2, h);
      ctx.fillStyle = '#3a7bd5';
      ctx.fillRect(0, h * 0.7, w, h * 0.3);
    });

    const landcoverPromise = makePngBlob((ctx, w, h) => {
      // Index image
      const img = ctx.createImageData(w, h);
      for (let i = 0; i < w * h; i += 1) {
        const idx = i % 8;
        img.data[i * 4] = idx;
        img.data[i * 4 + 1] = idx;
        img.data[i * 4 + 2] = idx;
        img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    });

    const splatPromise = makePngBlob((ctx, w, h) => {
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const idx = (y * w + x) * 4;
          img.data[idx] = x < w / 2 ? 255 : 0; // grass
          img.data[idx + 1] = x >= w / 2 ? 255 : 0; // rock
          img.data[idx + 2] = 0; // dirt
          img.data[idx + 3] = y > h * 0.8 ? 255 : 0; // snow
        }
      }
      ctx.putImageData(img, 0, 0);
    });

    const tilePromise = (hex: string) =>
      makePngBlob((ctx, w, h) => {
        ctx.fillStyle = hex;
        ctx.fillRect(0, 0, w, h);
      });

    const realFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('mstudio-file://') && url.includes('/build/chunks.json')) return new Response(JSON.stringify(chunksFile));
      if (url.startsWith('mstudio-file://') && url.includes('/build/heights.f32')) return new Response(heights.buffer.slice(0));
      if (url.startsWith('mstudio-file://') && (url.includes('/build/drape.png') || url.includes('/inputs/satellite.png'))) {
        return new Response(await drapePromise);
      }
      if (url.startsWith('mstudio-file://') && url.includes('/build/landcover.png')) {
        return new Response(await landcoverPromise);
      }
      if (url.startsWith('mstudio-file://') && url.includes('/build/splat.png')) {
        return new Response(await splatPromise);
      }
      if (url.startsWith('mstudio-file://') && url.includes('/materials/grass/albedo.png')) {
        return new Response(await tilePromise('#588157'));
      }
      if (url.startsWith('mstudio-file://') && url.includes('/materials/rock/albedo.png')) {
        return new Response(await tilePromise('#6c757d'));
      }
      if (url.startsWith('mstudio-file://') && url.includes('/materials/dirt/albedo.png')) {
        return new Response(await tilePromise('#8d6e63'));
      }
      if (url.startsWith('mstudio-file://') && url.includes('/materials/snow/albedo.png')) {
        return new Response(await tilePromise('#e0e1dd'));
      }
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
  await page.locator('[data-media-pane="explorer"]').getByRole('button', { name: 'valley' }).click();
  await expect(page.getByTestId('terrain-panel')).toBeVisible();
}

test('satellite drape in the viewport, shaded mode (dark)', async ({ page }) => {
  await openTerrain(page, spec());
  await expect(page.getByTestId('terrain-viewport')).toBeVisible({ timeout: 30_000 });
  await settle(page, 2500);
  await page.screenshot({ path: shotPath(OUT, 'terrain-viewport-drape-dark.png') });
});

test('satellite alignment with onion-skin quad overlay (dark)', async ({ page }) => {
  await openTerrain(page, spec());
  await expect(page.getByTestId('terrain-viewport')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Align satellite image/ }).click();
  await settle(page, 2000);
  await expect(page.getByText('Onion skin')).toBeVisible();
  await page.screenshot({ path: shotPath(OUT, 'terrain-alignment-onion-skin-dark.png') });
});

test('land-cover classification shading mode (dark)', async ({ page }) => {
  await openTerrain(page, spec());
  await expect(page.getByTestId('terrain-viewport')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Shading: Shaded/ }).click();
  await page.getByRole('option', { name: 'Land cover' }).click();
  await settle(page, 2500);
  await page.screenshot({ path: shotPath(OUT, 'terrain-viewport-landcover-dark.png') });
});

test('splat materials blending mode (dark)', async ({ page }) => {
  await openTerrain(page, spec());
  await expect(page.getByTestId('terrain-viewport')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Shading: Shaded/ }).click();
  await page.getByRole('option', { name: 'Splat' }).click();
  await settle(page, 2500);
  await page.screenshot({ path: shotPath(OUT, 'terrain-viewport-splat-dark.png') });
});

test('class brush palette active for land-cover painting (dark)', async ({ page }) => {
  await openTerrain(page, spec());
  await expect(page.getByTestId('terrain-viewport')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Paint class/ }).click();
  await settle(page, 1500);
  await expect(page.getByTestId('class-brush-palette')).toBeVisible();
  await page.screenshot({ path: shotPath(OUT, 'terrain-class-brush-dark.png') });
});
