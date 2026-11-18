// @vitest-environment node
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { TempRepo } from '@midnite/studio-git-engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearDrapePreviewCache } from './drape-preview';
import { noisyPng } from './drape-preview-fixture';
import { encodePngGrey16 } from '@midnite/studio-runtime';

import { readLevelTerrain } from './game-level-terrain';

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
