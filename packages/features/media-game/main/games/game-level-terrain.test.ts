// @vitest-environment node
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { TempRepo } from '@midnite/studio-git-engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearDrapePreviewCache } from './drape-preview';
import { noisyPng } from './drape-preview-fixture';
import { encodePngGrey16 } from '@midnite/studio-runtime';

import { createHeightSampler } from '@midnite/studio-shared';

import { groundHeights, placeDetail, readLevelGround, readLevelTerrain, readLevelTerrainDetail } from './game-level-terrain';
import { clearTerrainHeightsCache } from './terrain-heights';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const withTerrain = (name: string) => ({ properties: [{ name: 'midnite.terrain', type: 'string', value: name }] });

describe('readLevelTerrain (Phase 132 Theme E)', () => {
  let repo: TempRepo;
  beforeEach(async () => {
    clearDrapePreviewCache();
    repo = await TempRepo.create();
    await mkdir(join(repo.path, 'assets/terrain/world'), { recursive: true });
    await repo.writeFile('assets/index.json', JSON.stringify({ version: 1, assets: [{ name: 'world', kind: 'terrain', path: 'assets/terrain/world', entry: 'terrain.manifest.json' }] }));
    await repo.writeFile('assets/terrain/world/terrain.manifest.json', JSON.stringify({ bounds: { min: [-100, 0, -50], max: [100, 40, 50] }, maps: { drape: 'drape.png' } }));
    await writeFile(join(repo.path, 'assets/terrain/world/drape.png'), PNG);
  });
  afterEach(async () => {
    await repo.cleanup();
  });

  it('reads the pack bounds in metres and its drape image', async () => {
    const t = await readLevelTerrain(repo.path, withTerrain('world'));
    expect(t).toMatchObject({ name: 'world', minX: -100, minZ: -50, maxX: 100, maxZ: 50 });
    expect(t?.preview).toMatch(/^data:image\/png;base64,/);
  });

  it('adds the detail of the part a small level works in, and none for a level as big as its terrain', async () => {
    await repo.writeFile('assets/terrain/world/terrain.manifest.json', JSON.stringify({ bounds: { min: [-100, 0, -50], max: [100, 40, 50] }, maps: { drape: 'drape.png' }, roads: 'roads.json', buildings: '../../../../outside.json' }));
    await writeFile(join(repo.path, 'assets/terrain/world/drape.png'), noisyPng(200, 100));
    await repo.writeFile('assets/terrain/world/roads.json', JSON.stringify({ edges: [{ points: [[0, 0, 0], [5, 0, 5]], widthM: 4 }] }));
    const small = { ...withTerrain('world'), width: 10, height: 10, tilewidth: 32, tileheight: 32, layers: [] };
    const t = await readLevelTerrain(repo.path, small);
    expect(t?.detail).toMatchObject({ minX: -2, minZ: -2, maxX: 12, maxZ: 12, roads: [{ width: 4, points: [0, 0, 5, 5] }], buildings: [] });
    expect(t?.detail?.preview).toMatch(/^data:image\/png;base64,/);
    expect((await readLevelTerrain(repo.path, { ...small, width: 200, height: 100 }))?.detail).toBeUndefined();
    expect((await readLevelTerrain(repo.path, withTerrain('world')))?.detail).toBeUndefined();
  });

  it('sends the ground heights and the stated building heights when the pack has them', async () => {
    await repo.writeFile(
      'assets/terrain/world/terrain.manifest.json',
      JSON.stringify({ bounds: { min: [-100, 0, -50], max: [100, 40, 50] }, heightRange: [0, 40], heightfield: { png: 'heightfield.png', json: 'heightfield.json' }, buildings: 'buildings.json' }),
    );
    // 5 × 5 samples rising west to east.
    await writeFile(join(repo.path, 'assets/terrain/world/heightfield.png'), encodePngGrey16(Uint16Array.from({ length: 25 }, (_, i) => (i % 5) * 16383), 5, 5));
    await repo.writeFile('assets/terrain/world/heightfield.json', JSON.stringify({ heightRange: [10, 50] }));
    await repo.writeFile('assets/terrain/world/buildings.json', JSON.stringify({ buildings: [{ polygon: [[0, 0], [4, 0], [4, 4]], baseY: 30.04, height: 9 }] }));
    const t = await readLevelTerrain(repo.path, { ...withTerrain('world'), width: 10, height: 10, tilewidth: 32, tileheight: 32, layers: [] });
    expect(t?.heights).toMatchObject({ minX: -100, minZ: -50, maxX: 100, maxZ: 50, cols: 5, rows: 5, min: 10, max: 50 });
    expect(Buffer.from(t!.heights!.data, 'base64').readUInt16LE(8)).toBe(65532);
    expect(t?.detail?.buildingHeights).toEqual([30, 9]);
    expect(t?.detail?.heights).toMatchObject({ minX: -1.5, maxX: 11.5, cols: 2, rows: 2 });
    // A pack with no heightfield sends none.
    await repo.writeFile('assets/terrain/world/terrain.manifest.json', JSON.stringify({ bounds: { min: [-100, 0, -50], max: [100, 40, 50] } }));
    expect((await readLevelTerrain(repo.path, withTerrain('world')))?.heights).toBeUndefined();
  });

  it('adds the packs the level places round its terrain, each over the rectangle the level gives it', async () => {
    await mkdir(join(repo.path, 'assets/terrain/south'), { recursive: true });
    await repo.writeFile(
      'assets/index.json',
      JSON.stringify({ version: 1, assets: [{ name: 'world', kind: 'terrain', path: 'assets/terrain/world', entry: 'terrain.manifest.json' }, { name: 'south', kind: 'terrain', path: 'assets/terrain/south' }] }),
    );
    // The pack's own frame is centred on itself; the level says where it lies in the world.
    await repo.writeFile('assets/terrain/south/terrain.manifest.json', JSON.stringify({ bounds: { min: [-250, 0, -250], max: [250, 80, 250] }, maps: { drape: 'drape.png' }, heightRange: [0, 80], heightfield: { png: 'heightfield.png' } }));
    await writeFile(join(repo.path, 'assets/terrain/south/drape.png'), PNG);
    await writeFile(join(repo.path, 'assets/terrain/south/heightfield.png'), encodePngGrey16(Uint16Array.from({ length: 9 }, () => 32768), 3, 3));
    const placed = [{ name: 'south', minX: -300, minZ: 50, maxX: 210, maxZ: 560 }, { name: 'missing', minX: 0, minZ: 0, maxX: 1, maxZ: 1 }, { name: 'world', minX: 0, minZ: 0, maxX: 1, maxZ: 1 }];
    const level = { properties: [{ name: 'midnite.terrain', type: 'string', value: 'world' }, { name: 'midnite.terrainPacks', type: 'string', value: JSON.stringify(placed) }] };
    const t = await readLevelTerrain(repo.path, level);
    expect(t).toMatchObject({ name: 'world', minX: -100, maxX: 100 });
    // A pack that is not an asset, and the terrain named again, are left out.
    expect(t?.packs).toHaveLength(1);
    expect(t?.packs?.[0]).toMatchObject({ name: 'south', minX: -300, minZ: 50, maxX: 210, maxZ: 560, heights: { minX: -300, minZ: 50, maxX: 210, maxZ: 560, cols: 3, rows: 3, min: 0, max: 80 } });
    expect(t?.packs?.[0]?.preview).toMatch(/^data:image\/png;base64,/);
    // No property, or one that is not JSON: no packs.
    expect((await readLevelTerrain(repo.path, withTerrain('world')))?.packs).toBeUndefined();
    expect((await readLevelTerrain(repo.path, { properties: [level.properties[0]!, { name: 'midnite.terrainPacks', type: 'string', value: 'north' }] }))?.packs).toBeUndefined();
  });

  it('reads the detail under an area from the terrain, or from the pack placed there', async () => {
    await mkdir(join(repo.path, 'assets/terrain/south'), { recursive: true });
    await repo.writeFile(
      'assets/index.json',
      JSON.stringify({ version: 1, assets: [{ name: 'world', kind: 'terrain', path: 'assets/terrain/world', entry: 'terrain.manifest.json' }, { name: 'south', kind: 'terrain', path: 'assets/terrain/south' }] }),
    );
    await repo.writeFile('assets/terrain/world/terrain.manifest.json', JSON.stringify({ bounds: { min: [-100, 0, -50], max: [100, 40, 50] }, roads: 'roads.json' }));
    await repo.writeFile('assets/terrain/world/roads.json', JSON.stringify({ edges: [{ points: [[0, 0, 0], [5, 0, 5]], widthM: 4 }] }));
    // The pack's own frame is ±250; the level places it at twice the size, south of the terrain.
    await repo.writeFile('assets/terrain/south/terrain.manifest.json', JSON.stringify({ bounds: { min: [-250, 0, -250], max: [250, 80, 250] }, roads: 'roads.json', buildings: 'buildings.json', heightRange: [0, 80], heightfield: { png: 'heightfield.png' } }));
    await repo.writeFile('assets/terrain/south/roads.json', JSON.stringify({ edges: [{ points: [[-250, 0, -250], [0, 0, 0]], widthM: 6 }] }));
    await repo.writeFile('assets/terrain/south/buildings.json', JSON.stringify({ buildings: [{ polygon: [[0, 0], [10, 0], [10, 10]], baseY: 5, height: 9 }] }));
    await writeFile(join(repo.path, 'assets/terrain/south/heightfield.png'), encodePngGrey16(Uint16Array.from({ length: 25 }, () => 32768), 5, 5));
    const level = { properties: [{ name: 'midnite.terrain', type: 'string', value: 'world' }, { name: 'midnite.terrainPacks', type: 'string', value: JSON.stringify([{ name: 'south', minX: -500, minZ: 50, maxX: 500, maxZ: 1050 }]) }] };
    // Over the terrain: its own roads, in its own frame.
    expect(await readLevelTerrainDetail(repo.path, level, { minX: -20, minZ: -20, maxX: 20, maxZ: 20 })).toMatchObject({ roads: [{ width: 4, points: [0, 0, 5, 5] }], buildings: [] });
    // Over the pack: its roads and buildings, moved to where the level puts it (twice the size, shifted).
    const south = await readLevelTerrainDetail(repo.path, level, { minX: -300, minZ: 300, maxX: 300, maxZ: 800 });
    expect(south?.roads).toEqual([{ width: 6, points: [-500, 50, 0, 550] }]);
    expect(south?.buildings).toEqual([[0, 550, 20, 550, 20, 570]]);
    expect(south?.buildingHeights).toEqual([5, 9]);
    expect(south).toMatchObject({ minX: -300, minZ: 300, maxX: 300, maxZ: 800, heights: { minX: -300, minZ: 300, maxX: 300, maxZ: 800, min: 0, max: 80 } });
    // Nothing under the area, an area too wide, or a level with no terrain.
    expect(await readLevelTerrainDetail(repo.path, level, { minX: 5000, minZ: 5000, maxX: 5100, maxZ: 5100 })).toBeNull();
    expect(await readLevelTerrainDetail(repo.path, level, { minX: -20000, minZ: -20, maxX: 20000, maxZ: 20 })).toBeNull();
    expect(await readLevelTerrainDetail(repo.path, { properties: [] }, { minX: -20, minZ: -20, maxX: 20, maxZ: 20 })).toBeNull();
  });

  it('moves a detail from a pack frame to its place', () => {
    const moved = placeDetail({ minX: 0, minZ: 0, maxX: 10, maxZ: 10, preview: null, roads: [{ width: 3, points: [0, 0, 10, 10] }], buildings: [[0, 0, 5, 0, 5, 5]] }, { minX: -10, minZ: -10, maxX: 10, maxZ: 10 }, { minX: 100, minZ: 200, maxX: 120, maxZ: 220 });
    expect(moved).toMatchObject({ minX: 110, minZ: 210, maxX: 120, maxZ: 220, roads: [{ width: 3, points: [110, 210, 120, 220] }], buildings: [[110, 210, 115, 210, 115, 215]] });
  });

  it('draws only the outline when the pack has no drape', async () => {
    await repo.writeFile('assets/terrain/world/terrain.manifest.json', JSON.stringify({ bounds: { min: [0, 0, 0], max: [10, 1, 20] } }));
    expect(await readLevelTerrain(repo.path, withTerrain('world'))).toEqual({ name: 'world', minX: 0, minZ: 0, maxX: 10, maxZ: 20, preview: null });
  });

  it('answers null when there is no terrain to show', async () => {
    expect(await readLevelTerrain(repo.path, {})).toBeNull();
    expect(await readLevelTerrain(repo.path, withTerrain('missing'))).toBeNull();
    await repo.writeFile('assets/terrain/world/terrain.manifest.json', '{nope');
    expect(await readLevelTerrain(repo.path, withTerrain('world'))).toBeNull();
  });

  it('does not follow a path out of the game folder', async () => {
    await repo.writeFile('assets/index.json', JSON.stringify({ version: 1, assets: [{ name: 'world', kind: 'terrain', path: '../elsewhere' }] }));
    expect(await readLevelTerrain(repo.path, withTerrain('world'))).toBeNull();
  });

  it('passes a drape under 1 MB through byte for byte', async () => {
    const t = await readLevelTerrain(repo.path, withTerrain('world'));
    expect(t?.preview).toBe(`data:image/png;base64,${PNG.toString('base64')}`);
  });

  it('shows a big PNG drape downscaled instead of dropping it, and reuses it until the file changes', async () => {
    const big = noisyPng(1400, 1400);
    expect(big.length).toBeGreaterThan(1024 * 1024);
    await writeFile(join(repo.path, 'assets/terrain/world/drape.png'), big);
    const first = await readLevelTerrain(repo.path, withTerrain('world'));
    expect(first?.preview).toMatch(/^data:image\/png;base64,/);
    expect(first!.preview!.length).toBeLessThan(big.length);
    const again = await readLevelTerrain(repo.path, withTerrain('world'));
    expect(again?.preview).toBe(first?.preview);
    await writeFile(join(repo.path, 'assets/terrain/world/drape.png'), noisyPng(1500, 1500));
    expect((await readLevelTerrain(repo.path, withTerrain('world')))?.preview).not.toBe(first?.preview);
  });

  it('leaves out a big drape that is not a PNG, and an undecodable one', async () => {
    await repo.writeFile('assets/terrain/world/terrain.manifest.json', JSON.stringify({ bounds: { min: [0, 0, 0], max: [10, 1, 20] }, maps: { drape: 'drape.jpg' } }));
    await writeFile(join(repo.path, 'assets/terrain/world/drape.jpg'), Buffer.alloc(1100 * 1024, 1));
    expect((await readLevelTerrain(repo.path, withTerrain('world')))?.preview).toBeNull();
    await repo.writeFile('assets/terrain/world/terrain.manifest.json', JSON.stringify({ bounds: { min: [0, 0, 0], max: [10, 1, 20] }, maps: { drape: 'drape.png' } }));
    await writeFile(join(repo.path, 'assets/terrain/world/drape.png'), Buffer.alloc(1100 * 1024, 1));
    expect((await readLevelTerrain(repo.path, withTerrain('world')))?.preview).toBeNull();
  });
});

describe('readLevelGround (Phase 141 Theme A)', () => {
  let repo: TempRepo;
  const RES = 33;
  /** Ridges and noise at 33², so the full resolution differs from any coarser grid. */
  const samples = Uint16Array.from({ length: RES * RES }, (_, k) => Math.round(32768 + 30000 * Math.sin((k % RES) / 2.3) * Math.cos(Math.floor(k / RES) / 3.1)));
  const level = (packs?: unknown) => ({ properties: [{ name: 'midnite.terrain', type: 'string', value: 'world' }, ...(packs ? [{ name: 'midnite.terrainPacks', type: 'string', value: JSON.stringify(packs) }] : [])] });
  beforeEach(async () => {
    clearTerrainHeightsCache();
    repo = await TempRepo.create();
    await mkdir(join(repo.path, 'assets/terrain/world'), { recursive: true });
    await mkdir(join(repo.path, 'assets/terrain/south'), { recursive: true });
    await repo.writeFile(
      'assets/index.json',
      JSON.stringify({ version: 1, assets: [{ name: 'world', kind: 'terrain', path: 'assets/terrain/world' }, { name: 'south', kind: 'terrain', path: 'assets/terrain/south' }] }),
    );
    await repo.writeFile('assets/terrain/world/terrain.manifest.json', JSON.stringify({ bounds: { min: [-160, 0, -160], max: [160, 60, 160] }, heightfield: { png: 'heightfield.png', json: 'heightfield.json' } }));
    await repo.writeFile('assets/terrain/world/heightfield.json', JSON.stringify({ version: 1, resolution: RES, worldSize: 320, heightRange: [-5, 55], rowMajor: 'z', origin: 'centre' }));
    await writeFile(join(repo.path, 'assets/terrain/world/heightfield.png'), encodePngGrey16(samples, RES, RES));
    await repo.writeFile('assets/terrain/south/terrain.manifest.json', JSON.stringify({ bounds: { min: [-50, 0, -50], max: [50, 80, 50] }, heightRange: [0, 80], heightfield: { png: 'heightfield.png' } }));
    await writeFile(join(repo.path, 'assets/terrain/south/heightfield.png'), encodePngGrey16(Uint16Array.from({ length: 9 }, () => 32768), 3, 3));
  });
  afterEach(async () => {
    await repo.cleanup();
  });

  it('A1: samples the heightfield at its own resolution, as the kit does', async () => {
    const r = await readLevelGround(repo.path, level());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const kit = createHeightSampler(samples, { resolution: RES, worldSize: 320, heightRange: [-5, 55] });
    for (let k = 0; k < 500; k += 1) {
      const x = ((k * 37) % 319) - 159.5, z = ((k * 53) % 317) - 158.25;
      expect(Math.abs(r.ground.heightAt(x, z)! - kit.heightAt(x, z))).toBeLessThan(1e-4);
    }
    expect(r.ground.terrain).toBe('world');
    expect(r.ground.extent).toEqual({ minX: -160, minZ: -160, maxX: 160, maxZ: 160 });
    const n = r.ground.normalAt(3, 4)!;
    expect(Math.hypot(...n)).toBeCloseTo(1, 9);
    expect(n).toEqual(kit.normalAt(3, 4).map((v) => expect.closeTo(v, 4)));
  });

  it('A2/A3: a point over a placed pack samples that pack; one past everything is null', async () => {
    const r = await readLevelGround(repo.path, level([{ name: 'south', minX: -100, minZ: 160, maxX: 100, maxZ: 360 }]));
    if (!r.ok) throw new Error(r.message);
    expect(r.ground.heightAt(0, 260)).toBeCloseTo(40, 2);
    expect(r.ground.heightAt(0, 500)).toBeNull();
    expect(r.ground.normalAt(0, 500)).toBeNull();
    expect(r.ground.heightAt(-200, 0)).toBeNull();
  });

  it('fails plainly when the level has no terrain, or it cannot be read', async () => {
    expect(await readLevelGround(repo.path, { properties: [] })).toEqual({ ok: false, message: 'This level has no terrain.' });
    await repo.writeFile('assets/terrain/world/terrain.manifest.json', JSON.stringify({ bounds: { min: [-160, 0, -160], max: [160, 60, 160] } }));
    expect(await readLevelGround(repo.path, level())).toEqual({ ok: false, message: 'The terrain "world" has no readable heightfield.' });
  });

  it('F1/F2: game_terrain_height answers the sampler, clamping and listing a point off the ground', async () => {
    const r = await readLevelGround(repo.path, level());
    if (!r.ok) throw new Error(r.message);
    const out = groundHeights(r.ground, [{ x: 3.3, z: -7.7 }, { x: 900, z: 12 }, { x: -50, z: 50 }], true);
    expect(out.terrain).toBe('world');
    expect(out.outside).toEqual([1]);
    expect(out.heights[0]).toBeCloseTo(r.ground.heightAt(3.3, -7.7)!, 4);
    expect(out.heights[1]).toBeCloseTo(r.ground.heightAt(160, 12)!, 4);
    expect(out.heights[2]).toBeCloseTo(r.ground.heightAt(-50, 50)!, 4);
    expect(out.normals).toHaveLength(3);
    expect(out.normals![1]).toEqual(r.ground.normalAt(160, 12));
    expect(groundHeights(r.ground, [{ x: 0, z: 0 }], false).normals).toBeUndefined();
  });

  it('A4: does not follow a path out of the game folder', async () => {
    await repo.writeFile('assets/index.json', JSON.stringify({ version: 1, assets: [{ name: 'world', kind: 'terrain', path: '../elsewhere' }] }));
    expect((await readLevelGround(repo.path, level())).ok).toBe(false);
    await repo.writeFile('assets/index.json', JSON.stringify({ version: 1, assets: [{ name: 'world', kind: 'terrain', path: 'assets/terrain/world' }] }));
    await repo.writeFile('assets/terrain/world/terrain.manifest.json', JSON.stringify({ bounds: { min: [-160, 0, -160], max: [160, 60, 160] }, heightfield: { png: '../../../../outside.png' } }));
    expect((await readLevelGround(repo.path, level())).ok).toBe(false);
  });
});
