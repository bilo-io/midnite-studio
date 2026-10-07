import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { map } from '@midnite/studio-shared';

import { decodePng } from '../png/png-codec';
import { createSatelliteRun } from './capture-run';

let dir: string;
afterEach(async () => dir && (await rm(dir, { recursive: true, force: true })));

const [CX, CY] = map.lonLatToWorld(18.4, -34);

/** Tiles whose red channel rises east and green rises south, so orientation and extent are checkable. */
function gradientTile(z: number, x: number, y: number): Uint8Array {
  const out = new Uint8Array(map.TILE * map.TILE * 4);
  const n = 2 ** z;
  for (let py = 0; py < map.TILE; py += 1)
    for (let px = 0; px < map.TILE; px += 1) {
      const wx = (x + (px + 0.5) / map.TILE) / n;
      const wy = (y + (py + 0.5) / map.TILE) / n;
      const c = (v: number, v0: number) => Math.max(0, Math.min(255, Math.round((v - v0) * 2e6 + 128)));
      out.set([c(wx, CX), c(wy, CY), 0, 255], (py * map.TILE + px) * 4);
    }
  return out;
}

describe('satellite run', () => {
  it('reprojects onto the local square, north at the top and east to the right', async () => {
    dir = await mkdtemp(join(tmpdir(), 'sat-'));
    const frame = { center: [18.4, -34] as [number, number], sideM: 4000 };
    const size = 64;
    const plan = map.chooseCaptureZoom({ minZoom: 0, maxZoom: 14, tileSize: 256 }, frame, size, { pitched: false });
    const run = createSatelliteRun({ frame, size, plan, outDir: dir });
    for (const t of map.listTiles(plan)) run.addTile(t.x, t.y, gradientTile(plan.z, t.x, t.y), map.TILE, map.TILE);
    const done = await run.finish();
    expect(done).toMatchObject({ ok: true, stats: { files: ['satellite.png'] } });
    const png = decodePng(await readFile(join(dir, 'satellite.png')));
    expect(png.ok).toBe(true);
    if (!png.ok) return;
    const d = png.image.data as Uint8Array;
    const px = (i: number, j: number, c: number) => d[(j * size + i) * 4 + c]!;
    expect(px(0, 0, 3)).toBe(255);
    // 2 km either side of the centre is ~±100 on the ramp: west < centre < east, north < centre < south.
    expect(px(0, 32, 0)).toBeLessThan(40);
    expect(px(size - 1, 32, 0)).toBeGreaterThan(216);
    expect(px(32, 0, 1)).toBeLessThan(40);
    expect(px(32, size - 1, 1)).toBeGreaterThan(216);
    // Pixel-centred: the middle two pixels straddle the centre value 128.
    expect(Math.abs(px(31, 31, 0) - 128)).toBeLessThan(6);
    expect(Math.abs(px(32, 32, 1) - 128)).toBeLessThan(6);
  });
});
