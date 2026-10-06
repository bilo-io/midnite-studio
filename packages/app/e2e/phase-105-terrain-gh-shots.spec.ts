import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 105 Themes G + H screenshots for the PR: the road network, buildings and foliage over the
 * terrain (WebGL, so a real browser), and the Roads / Foliage / Buildings panel sections.
 *
 * `build/{roads,buildings,foliage}.json` and the heightfield are served by a `fetch` shim; images are
 * swapped for generated data URLs at the `src` setter, since an `<img>` never goes through `fetch`.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise.
 */
const OUT = '../../docs/screenshots/phase-105-terrain-gh';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 120_000 });
test.use({ viewport: SHOT_VIEWPORTS.wide });

const WORLD = 256;
const stats = {
  resolution: 129,
  worldSize: WORLD,
  vertexCount: 16641,
  triangleCount: 32768,
  chunkCount: 4,
  lodCount: 4,
  buildMs: 640,
  minHeight: 0,
  maxHeight: 40,
  histogram: new Array<number>(16).fill(1000),
  foliageCount: 1460,
  roadAgreement: 0.91,
  warnings: [],
};

const img = (file: string) => ({ file, sourceName: file.split('/')[1]!, width: 512, height: 512, bitDepth: 8 as const });

const specOf = (built: boolean) => JSON.stringify({
  version: 1,
  name: 'Hamlet',
  resolution: 129,
  worldSize: WORLD,
  heightRange: [0, 40],
  textureSize: 2048,
  inputs: { heightmap: { ...img('inputs/heightmap.png'), bitDepth: 16 }, satellite: img('inputs/satellite.png'), roads: img('inputs/roads.png') },
  ...(built ? { lastBuild: { at: '2026-10-06T12:00:00.000Z', buildMs: 640, stats } } : {}),
});

const data = (built: boolean): MockFixtures => ({
  ...fixtures,
  media: { files: { 'terrain:terrains': { 'hamlet-20261004-120000/terrain.json': specOf(built) } }, terrain: { stats } },
});

/**
 * `built: false` leaves the viewport empty: the panel sections depend only on the inputs, and a
 * software-WebGL canvas drawing ~1 500 instances keeps the page too busy for actionability checks.
 */
async function openTerrain(page: Page, built = true): Promise<void> {
  await installMockBridge(page, data(built));
  await page.addInitScript((world: number) => {
    const res = 129;
    const h = (u: number, v: number) => 8 + 4 * Math.sin(u * 7) * Math.cos(v * 5) + 22 * Math.max(0, 1 - Math.hypot(u - 0.85, v - 0.15) * 3);
    const at = (x: number, z: number) => h(x / world + 0.5, z / world + 0.5);
    const heights = new Float32Array(res * res);
    for (let z = 0; z < res; z += 1) for (let x = 0; x < res; x += 1) heights[z * res + x] = h(x / (res - 1), z / (res - 1));
    const half = world / 2;
    const chunks = [];
    for (let cz = 0; cz < 2; cz += 1) {
      for (let cx = 0; cx < 2; cx += 1) {
        chunks.push({ cx, cz, minY: 0, maxY: 40, centre: [-half + cx * half + half / 2, 20, -half + cz * half + half / 2], radius: Math.hypot(half / 2, 20, half / 2) });
      }
    }
    const chunksFile = { resolution: res, worldSize: world, heightRange: [0, 40], chunkVerts: 65, chunksPerSide: 2, lodCount: 4, chunks };

    // Roads: an avenue along x, a street crossing it, and a winding path off the street.
    const line = (pts: [number, number][]) => pts.map(([x, z]) => [x, at(x, z), z] as [number, number, number]);
    const steps = (from: [number, number], to: [number, number], n: number) =>
      Array.from({ length: n + 1 }, (_, i) => [from[0] + ((to[0] - from[0]) * i) / n, from[1] + ((to[1] - from[1]) * i) / n] as [number, number]);
    const path = Array.from({ length: 12 }, (_, i) => [-40 + i * 9, -20 - i * 7 + 8 * Math.sin(i * 0.9)] as [number, number]);
    const nodes = [
      { id: 0, p: [-128, at(-128, 0), 0], degree: 1 },
      { id: 1, p: [-40, at(-40, 0), 0], degree: 4 },
      { id: 2, p: [128, at(128, 0), 0], degree: 1 },
      { id: 3, p: [-40, at(-40, 128), 128], degree: 1 },
      { id: 4, p: [path.at(-1)![0], 0, path.at(-1)![1]], degree: 1 },
    ];
    const edges = [
      { id: 0, a: 0, b: 1, points: line(steps([-128, 0], [-40, 0], 8)), widthM: 11, kind: 'avenue', lengthM: 88 },
      { id: 1, a: 1, b: 2, points: line(steps([-40, 0], [128, 0], 14)), widthM: 11, kind: 'avenue', lengthM: 168 },
      { id: 2, a: 1, b: 3, points: line(steps([-40, 0], [-40, 128], 10)), widthM: 7, kind: 'street', lengthM: 128 },
      { id: 3, a: 1, b: 4, points: line([[-40, 0], ...path]), widthM: 3.5, kind: 'path', lengthM: 130 },
    ];
    const roads = { version: 1, nodes, edges };

    // Buildings: a block of houses beside the street.
    const buildings: { polygon: number[][]; baseY: number; height: number }[] = [];
    for (let i = 0; i < 4; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        const x0 = -110 + j * 22;
        const z0 = 14 + i * 26;
        const polygon = [[x0, z0], [x0 + 14, z0], [x0 + 14, z0 + 16], [x0, z0 + 16]];
        buildings.push({ polygon, baseY: at(x0 + 7, z0 + 8), height: 5 + ((i * 3 + j) % 4) * 4 });
      }
    }

    // Foliage: a wood in the far quadrant, grass clumps and bushes in the near one.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const instances: number[][] = [];
    for (let k = 0; k < 900; k += 1) {
      const x = 10 + rnd() * 110;
      const z = -120 + rnd() * 108;
      instances.push([Math.floor(rnd() * 3), x, at(x, z), z, rnd() * 6.28, 0.8 + rnd() * 0.5]);
    }
    for (let k = 0; k < 560; k += 1) {
      const x = 0 + rnd() * 120;
      const z = 12 + rnd() * 110;
      instances.push([3 + Math.floor(rnd() * 2), x, at(x, z), z, rnd() * 6.28, 0.8 + rnd() * 0.5]);
    }
    const foliage = { version: 1, assets: ['pine', 'broadleaf', 'birch', 'grass-clump', 'bush'], instances };

    // Images, generated once as data URLs so both <img> and three's ImageLoader can take them.
    const canvasUrl = (size: number, paint: (ctx: CanvasRenderingContext2D, s: number) => void) => {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      paint(c.getContext('2d')!, size);
      return c.toDataURL('image/png');
    };
    const roadStrokes = (ctx: CanvasRenderingContext2D, s: number, colour: string) => {
      const px = (m: number) => (m / world + 0.5) * s;
      ctx.strokeStyle = colour;
      ctx.lineCap = 'round';
      for (const e of edges) {
        ctx.lineWidth = (e.widthM / world) * s;
        ctx.beginPath();
        e.points.forEach(([x, , z], i) => (i === 0 ? ctx.moveTo(px(x), px(z)) : ctx.lineTo(px(x), px(z))));
        ctx.stroke();
      }
    };
    const satellite = canvasUrl(256, (ctx, s) => {
      const g = ctx.createLinearGradient(0, 0, s, s);
      g.addColorStop(0, '#6a8f4e');
      g.addColorStop(1, '#4f7a3c');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#3b5f2c';
      ctx.fillRect(s * 0.54, 0, s * 0.46, s * 0.45);
    });
    const roadsInput = canvasUrl(512, (ctx, s) => {
      ctx.fillStyle = '#0b1320';
      ctx.fillRect(0, 0, s, s);
      roadStrokes(ctx, s, '#00e5ff');
    });
    const roadsMask = canvasUrl(512, (ctx, s) => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, s, s);
      roadStrokes(ctx, s, '#fff');
    });
    const images: [string, string][] = [
      ['/inputs/roads.png', roadsInput],
      ['/build/roads-mask.png', roadsMask],
      ['/build/drape.png', satellite],
      ['/inputs/satellite.png', satellite],
      ['/inputs/heightmap.png', roadsMask],
    ];
    const rewrite = (url: string) => (url.startsWith('mstudio-file://') ? (images.find(([k]) => url.includes(k))?.[1] ?? url) : url);
    const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      ...desc,
      set(this: HTMLImageElement, value: string) {
        desc.set!.call(this, rewrite(String(value)));
      },
    });

    const realFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('mstudio-file://')) {
        if (url.includes('/build/chunks.json')) return new Response(JSON.stringify(chunksFile));
        if (url.includes('/build/heights.f32')) return new Response(heights.buffer.slice(0));
        if (url.includes('/build/roads.json')) return new Response(JSON.stringify(roads));
        if (url.includes('/build/buildings.json')) return new Response(JSON.stringify({ version: 1, buildings }));
        if (url.includes('/build/foliage.json')) return new Response(JSON.stringify(foliage));
      }
      return realFetch(input, init);
    };

    // The roads preview: the mock answers a 1×1 PNG; answer the real mask so the panel reads.
    const patch = () => {
      const terrain = (window as unknown as { midniteStudio?: { media: { terrain: { roadKey: unknown } } } }).midniteStudio?.media.terrain;
      if (!terrain) return void setTimeout(patch, 20);
      terrain.roadKey = async (req: { colour?: string }) => ({
        ok: true,
        value: { pngBase64: roadsMask.split(',')[1], colour: req.colour ?? '#00e5ff', detected: '#00e5ff' },
      });
    };
    patch();
  }, WORLD);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 90_000 });
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: 'Terrain' }).click();
    await expect(page.getByRole('tab', { name: 'Terrain', selected: true })).toBeVisible({ timeout: 2500 });
  }).toPass({ timeout: 45_000 });
  await setTheme(page, 'dark', { settleMs: 200 });
  await page.locator('[data-media-pane="explorer"]').getByRole('button', { name: 'hamlet' }).click();
  await expect(page.getByTestId('terrain-panel')).toBeVisible();
  if (built) await expect(page.getByTestId('terrain-viewport')).toBeVisible({ timeout: 30_000 });
}

test('roads, buildings and foliage over the shaded terrain (dark)', async ({ page }) => {
  await openTerrain(page);
  await settle(page, 3000);
  await page.screenshot({ path: shotPath(OUT, 'terrain-layers-shaded-dark.png') });
});

test('road network over the road-mask debug mode (dark)', async ({ page }) => {
  await openTerrain(page);
  await page.getByRole('button', { name: /Shading: Shaded/ }).dispatchEvent('click');
  await page.getByRole('option', { name: /Road mask/ }).dispatchEvent('click');
  await settle(page, 2500);
  await page.screenshot({ path: shotPath(OUT, 'terrain-roads-mode-dark.png') });
});

test('Roads section: source, live mask preview and eyedropper (dark)', async ({ page }) => {
  await openTerrain(page, false);
  const roads = page.getByTestId('terrain-roads-section');
  await roads.scrollIntoViewIfNeeded();
  await expect(roads.getByRole('img', { name: 'Road mask preview' })).toBeVisible();
  await roads.getByRole('button', { name: 'Pick the road colour from the image' }).click();
  await settle(page, 500);
  await roads.screenshot({ path: shotPath(OUT, 'terrain-roads-section-dark.png') });
});

test('Foliage and Buildings sections (dark)', async ({ page }) => {
  await openTerrain(page, false);
  const foliage = page.getByTestId('terrain-foliage-section');
  await foliage.scrollIntoViewIfNeeded();
  await settle(page, 300);
  const a = await foliage.boundingBox();
  const b = await page.getByTestId('terrain-buildings-section').boundingBox();
  await page.screenshot({
    path: shotPath(OUT, 'terrain-foliage-buildings-sections-dark.png'),
    clip: { x: a!.x - 8, y: a!.y - 8, width: Math.max(a!.width, b!.width) + 16, height: b!.y + b!.height - a!.y + 16 },
  });
});
