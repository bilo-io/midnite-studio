import * as sharedModule from '@midnite/studio-shared';
import { expect, type Page, test } from '@playwright/test';

import { encodePng } from '../../desktop/src/main/media/model/sf3d/png';
import { clickRailLink, fixtures, installMockBridge, type MockFixtures, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 104 Theme G screenshots: paint mode on an unwrapped, baked bust — a preset layer stack (edge wear and
 * cavity dirt from the bakes), brush strokes on a paint layer, and the layers panel. Run with
 * `MSTUDIO_SHOTS=1`. Needs a real browser: WebGL for the PBR viewport and real pointer drags on the canvas.
 *
 * The fixture is built here with the kernel — an SDF bust baked, decimated, unwrapped and baked onto — so the
 * mock bridge serves exactly what `model_sdf_set` → `model_decimate` → `model_unwrap` → `model_bake` would write.
 */
const OUT = '../../docs/screenshots/p104-g';
// Under Playwright the shared package loads as CommonJS; its re-exports sit on the default export.
const shared = (sharedModule as unknown as { default?: typeof sharedModule }).default ?? sharedModule;
const { bakeSdf, decimateMesh, unwrapMesh, bakeMaps, EditableMesh, encodeMeshBin, modelAssetHash } = shared;

const TREE = {
  blend: 0.06,
  nodes: [
    { kind: 'ellipsoid', name: 'cranium', radii: [0.3, 0.36, 0.33], position: [0, 0.42, 0] },
    { kind: 'sphere', name: 'nose', radius: 0.06, position: [0, 0.38, 0.32] },
    { kind: 'ellipsoid', name: 'brow', radii: [0.22, 0.05, 0.08], position: [0, 0.52, 0.24] },
    { kind: 'ellipsoid', name: 'jaw', radii: [0.2, 0.12, 0.2], position: [0, 0.2, 0.1] },
    { kind: 'capsule', name: 'neck', radius: 0.12, height: 0.25, position: [0, 0.02, 0] },
    { kind: 'ellipsoid', name: 'left ear', radii: [0.04, 0.09, 0.06], position: [0.3, 0.4, 0] },
    { kind: 'ellipsoid', name: 'right ear', radii: [0.04, 0.09, 0.06], position: [-0.3, 0.4, 0] },
  ],
};

const rgba = (bytes: Uint8Array, channels: 1 | 3): Uint8Array => {
  const out = new Uint8Array((bytes.length / channels) * 4);
  for (let i = 0; i < bytes.length / channels; i += 1) {
    out[i * 4] = bytes[i * channels]!;
    out[i * 4 + 1] = bytes[i * channels + (channels === 3 ? 1 : 0)]!;
    out[i * 4 + 2] = bytes[i * channels + (channels === 3 ? 2 : 0)]!;
    out[i * 4 + 3] = 255;
  }
  return out;
};

async function fixture(): Promise<{ files: Record<string, string>; sidecar: string }> {
  const high = bakeSdf(TREE as never, { resolution: 112 });
  const dec = decimateMesh({ positions: high.positions, indices: high.indices }, { targetTriangles: 5000 });
  const un = unwrapMesh({ positions: dec.positions, indices: dec.indices }, { textureSize: 1024 });
  const low = new EditableMesh({ positions: un.positions, indices: un.indices });
  const highMesh = new EditableMesh({ positions: high.positions, indices: high.indices });
  const size = 512;
  const baked = await bakeMaps({ high: { positions: highMesh.positions, indices: highMesh.indices, normals: highMesh.normals }, low: { positions: low.positions, indices: low.indices, normals: low.normals, uvs: un.uvs }, size, aoSamples: 8 });
  const mesh = encodeMeshBin({ positions: low.positions, normals: low.normals, indices: low.indices, uvs: un.uvs, multiresLevel: 0 });
  const files: Record<string, string> = {};
  const add = (name: string, bytes: Uint8Array): { src: string; hash: string } => {
    files[name] = Buffer.from(bytes).toString('base64');
    return { src: name, hash: modelAssetHash(bytes) };
  };
  const meshFile = add('bust.p1.mesh.bin', mesh);
  const maps: Record<string, { src: string; hash: string }> = {};
  for (const kind of ['normal', 'ao', 'curvature', 'cavity'] as const) {
    const raw = baked[kind]!;
    const png = encodePng(rgba(raw, kind === 'normal' ? 3 : 1), size, size);
    maps[kind] = add(`bust.p1.${kind}.png`, new Uint8Array(png.buffer, png.byteOffset, png.byteLength));
  }
  const sidecar = JSON.stringify({
    version: 1,
    name: 'bust',
    prompt: 'A painted bust',
    engine: 'ollama:qwen2.5-coder:7b',
    spec: {
      name: 'Bust',
      parts: [
        {
          id: 'p1',
          name: 'bust',
          shape: 'sculpt',
          src: meshFile.src,
          hash: meshFile.hash,
          vertices: low.vertexCount,
          triangles: low.faceCount,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          color: '#b0b0b0',
          uv: { charts: un.charts, density: { mean: Math.round(un.density.mean), min: Math.round(un.density.min), max: Math.round(un.density.max) }, textureSize: 1024, coverage: Number(un.coverage.toFixed(3)) },
          maps,
        },
      ],
    },
    createdAt: '2026-10-07T00:00:00.000Z',
  });
  return { files, sidecar };
}

async function stroke(page: Page, points: [number, number][]): Promise<void> {
  await page.mouse.move(...points[0]!);
  await page.mouse.down();
  for (let i = 1; i < points.length; i += 1) {
    const [ax, ay] = points[i - 1]!;
    const [bx, by] = points[i]!;
    for (let k = 1; k <= 10; k += 1) await page.mouse.move(ax + ((bx - ax) * k) / 10, ay + ((by - ay) * k) / 10);
  }
  await page.mouse.up();
  await settle(page, 300);
}

test.describe('phase 104 theme G screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: SHOT_VIEWPORTS.wide });

  test('paint mode', async ({ page }) => {
    test.setTimeout(600_000);
    const { files, sidecar } = await fixture();
    const DATA: MockFixtures = { ...fixtures, media: { files: { 'model:busts': { 'bust.obj': 'o x', 'bust.mtl': 'x', 'bust.fbx': 'x', 'bust.json': sidecar } } } };
    await installMockBridge(page, DATA);
    // The editor reads model files over `mstudio-file://` and writes textures through the mesh channel: serve both from memory.
    await page.addInitScript((initial: Record<string, string>) => {
      const store = new Map<string, Uint8Array>(Object.entries(initial).map(([k, v]) => [k, Uint8Array.from(atob(v), (c) => c.charCodeAt(0))]));
      const real = window.fetch.bind(window);
      window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const name = decodeURIComponent(url.split('/').pop() ?? '');
        const hit = store.get(name);
        if (hit && (name.endsWith('.png') || name.endsWith('.mesh.bin'))) return Promise.resolve(new Response(hit.slice(), { status: 200 }));
        return real(input, init);
      };
      const api = (window as unknown as { midniteStudio?: { media?: { model?: { mesh?: Record<string, unknown> } } } }).midniteStudio;
      const model = api?.media?.model;
      if (model)
        model.mesh = {
          read: async ({ src }: { src: string }) => (store.has(src) ? { ok: true, value: { data: store.get(src)!.slice() } } : { ok: false, kind: 'error', message: 'missing' }),
          write: async ({ src, data }: { src: string; data: Uint8Array }) => {
            store.set(src, new Uint8Array(data));
            return { ok: true, value: {} };
          },
          appendOps: async () => ({ ok: true, value: {} }),
          readOps: async () => ({ ok: true, value: { entries: [] } }),
          writeTexture: async ({ src, data }: { src: string; data: Uint8Array }) => {
            store.set(src, new Uint8Array(data));
            return { ok: true, value: { texture: { src, hash: '', width: 0, height: 0 } } };
          },
        };
    }, files);
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

    await page.getByRole('tablist', { name: 'Part panels' }).getByRole('tab', { name: 'Paint' }).click();
    await page.getByRole('button', { name: 'Paint bust' }).click();
    const status = page.getByTestId('paint-status');
    await expect(status).toContainText('Painting bust', { timeout: 120_000 });

    // A preset stack: painted metal, worn at the convex edges (curvature) and dirty in the crevices (cavity).
    await page.getByLabel('Preset', { exact: true }).selectOption('painted_metal');
    await expect(page.getByTestId('paint-layers')).toContainText('Edge wear', { timeout: 60_000 });
    await settle(page, 1500);
    const canvas = page.getByTestId('model-canvas');
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + box.height - 30);
    await settle(page, 600);
    await page.screenshot({ path: shotPath(OUT, 'paint-preset.png') });

    // Brush strokes in red on a new paint layer: a stripe over the cranium and a dot on the cheek.
    await page.getByRole('button', { name: 'Paint layer' }).click();
    await page.getByLabel('Paint radius', { exact: true }).fill('14');
    await page.getByLabel('Paint radius', { exact: true }).press('Enter');
    await page.locator('input[type="color"]').first().evaluate((el: HTMLInputElement) => {
      el.value = '#d0312d';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await stroke(page, [[cx - 60, cy - 120], [cx, cy - 135], [cx + 60, cy - 120]]);
    await stroke(page, [[cx - 70, cy - 40], [cx - 66, cy - 36]]);
    await page.getByRole('radio', { name: 'Stamp' }).click();
    await page.getByLabel('Paint radius', { exact: true }).fill('40');
    await page.getByLabel('Paint radius', { exact: true }).press('Enter');
    await stroke(page, [[cx + 60, cy - 30], [cx + 62, cy - 28]]);
    await expect(status).toContainText('unsaved');
    await page.mouse.move(box.x + 30, box.y + box.height - 30);
    await settle(page, 800);
    await page.screenshot({ path: shotPath(OUT, 'paint-strokes.png') });

    // The inspector's Paint tab: brushes, channel, the layer stack.
    await page.getByTestId('model-inspector').screenshot({ path: shotPath(OUT, 'paint-panel.png') });

    // Done painting writes the textures; the ordinary viewport then draws the flattened PBR set.
    await page.getByRole('button', { name: 'Done painting' }).click();
    await expect(page.getByRole('button', { name: 'Paint bust' })).toBeVisible({ timeout: 60_000 });
    await page.mouse.move(box.x + 30, box.y + box.height - 30);
    await settle(page, 1500);
    await page.screenshot({ path: shotPath(OUT, 'painted-saved.png') });
  });
});
