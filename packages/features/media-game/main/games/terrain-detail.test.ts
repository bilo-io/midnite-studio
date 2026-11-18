// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { decodePng, encodePngRgba8 } from '@midnite/studio-runtime';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildingsIn, clearTerrainDetailCache, cropDrape, readTerrainDetail, roadsIn, workExtent } from './terrain-detail';

const TERRAIN = { minX: -5000, minZ: -5000, maxX: 5000, maxZ: 5000 };
const prop = (name: string, value: number) => ({ name, type: 'float', value });
const level = (over: Record<string, unknown> = {}) => ({
  width: 1600, height: 1400, tilewidth: 32, tileheight: 32,
  properties: [prop('midnite.metresPerTile', 1), prop('midnite.originX', -2200), prop('midnite.originY', -3400)],
  layers: [{ type: 'objectgroup', objects: [{ x: 250 * 32, y: 1255 * 32 }] }],
  ...over,
});

/** A 100 x 100 image whose red channel is the column and green the row, so a crop can be checked by value. */
const gradient = (): Buffer => {
  const data = new Uint8Array(100 * 100 * 4);
  for (let y = 0; y < 100; y += 1) for (let x = 0; x < 100; x += 1) data.set([x, y, 0, 255], (y * 100 + x) * 4);
  return encodePngRgba8(data, 100, 100);
};

describe('workExtent', () => {
  it('pads the map rectangle and its objects, in world metres', () => {
    expect(workExtent(level() as never, TERRAIN)).toEqual({ minX: -2440, minZ: -3610, maxX: -360, maxZ: -1790 });
  });
  it('grows to an object outside the map, and clamps to the terrain', () => {
    const far = level({ layers: [{ type: 'objectgroup', objects: [{ x: -3000 * 32, y: 0 }] }] });
    expect(workExtent(far as never, TERRAIN)!.minX).toBe(-5000);
  });
  it('is null for a level that covers half its terrain or more, or misses it', () => {
    expect(workExtent(level({ width: 6000, height: 6000 }) as never, TERRAIN)).toBeNull();
    expect(workExtent(level() as never, { minX: 0, minZ: 0, maxX: 100, maxZ: 100 })).toBeNull();
  });
});

describe('cropDrape', () => {
  it('cuts the area out at the drape’s own resolution and reports the snapped extent', () => {
    // 100 px over 10 km is 100 m a pixel: -2000..-1000 by -3000..-2500 is columns 30..40, rows 20..25.
    const crop = cropDrape(gradient(), TERRAIN, { minX: -2000, minZ: -3000, maxX: -1000, maxZ: -2500 })!;
    expect(crop.extent).toEqual({ minX: -2000, minZ: -3000, maxX: -1000, maxZ: -2500 });
    const out = decodePng(crop.png);
    expect(out.ok && [out.image.width, out.image.height]).toEqual([10, 5]);
    expect(out.ok && [out.image.data[0], out.image.data[1]]).toEqual([30, 20]);
    const snapped = cropDrape(gradient(), TERRAIN, { minX: -1950, minZ: -3000, maxX: -1000, maxZ: -2500 })!;
    expect(snapped.extent.minX).toBe(-2000);
  });
  it('is null for bytes that are not a PNG and for an area under two pixels', () => {
    expect(cropDrape(Buffer.from('nope'), TERRAIN, TERRAIN)).toBeNull();
    expect(cropDrape(gradient(), TERRAIN, { minX: 0, minZ: 0, maxX: 50, maxZ: 50 })).toBeNull();
  });
});

describe('roadsIn and buildingsIn', () => {
  const area = { minX: 0, minZ: 0, maxX: 100, maxZ: 100 };
  it('keeps what touches the area, as flat x,z runs rounded to 0.1 m', () => {
    const roads = roadsIn({ edges: [
      { points: [[10.04, 5, 20.06], [50, 6, 60]], widthM: 7 },
      { points: [[500, 0, 500], [600, 0, 600]], widthM: 4 },
      { points: [[-50, 0, 50], [150, 0, 50]] },
      { points: [[1, 1, 1]] },
    ] }, area);
    expect(roads).toEqual([{ width: 7, points: [10, 20.1, 50, 60] }, { width: 3, points: [-50, 50, 150, 50] }]);
    const buildings = buildingsIn({ buildings: [{ polygon: [[10, 10], [20, 10], [20, 20]] }, { polygon: [[900, 900], [910, 900], [910, 910]] }, { polygon: [[1, 1], [2, 2]] }] }, area);
    expect(buildings).toEqual([[10, 10, 20, 10, 20, 20]]);
  });
  it('reads anything else as none', () => {
    expect(roadsIn(null, area)).toEqual([]);
    expect(roadsIn({ edges: 'x' }, area)).toEqual([]);
    expect(buildingsIn({ buildings: [{ polygon: 'x' }, null] }, area)).toEqual([]);
  });
});

describe('readTerrainDetail', () => {
  let dir: string;
  beforeEach(async () => {
    clearTerrainDetailCache();
    dir = await mkdtemp(join(tmpdir(), 'terrain-detail-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('brings back the crop, roads and buildings, and whatever is missing is simply left out', async () => {
    const area = { minX: -2000, minZ: -3000, maxX: -1000, maxZ: -2500 };
    await writeFile(join(dir, 'drape.png'), gradient());
    await writeFile(join(dir, 'roads.json'), JSON.stringify({ edges: [{ points: [[-1500, 0, -2800], [-1400, 0, -2700]], widthM: 7 }] }));
    const full = await readTerrainDetail({ drapePng: join(dir, 'drape.png'), roads: join(dir, 'roads.json'), buildings: join(dir, 'missing.json') }, TERRAIN, area);
    expect(full.preview).toMatch(/^data:image\/png;base64,/);
    expect(full.roads).toHaveLength(1);
    expect(full.buildings).toEqual([]);
    expect(await readTerrainDetail({ drapePng: join(dir, 'drape.png'), roads: join(dir, 'roads.json'), buildings: join(dir, 'missing.json') }, TERRAIN, area)).toBe(full);
    const bare = await readTerrainDetail({ drapePng: null, roads: null, buildings: null }, TERRAIN, area);
    expect(bare).toEqual({ ...area, preview: null, roads: [], buildings: [] });
  });
});
