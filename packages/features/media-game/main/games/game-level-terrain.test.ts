// @vitest-environment node
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { TempRepo } from '@midnite/studio-git-engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearDrapePreviewCache } from './drape-preview';
import { noisyPng } from './drape-preview-fixture';
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
