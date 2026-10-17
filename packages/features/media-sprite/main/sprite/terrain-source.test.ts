// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TERRAIN_SPEC_FILE, TerrainSpecSchema } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { encodePngRgba8 } from '@midnite/studio-runtime';
import { readTerrainSource, TERRAIN_NOT_BUILT } from './terrain-source';

/** No terrain build is on disk in these tests, so there is no splat to bake from. */
const noBake = async () => null;

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'terrain-source-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function terrain(opts: { drape?: boolean; landcover?: boolean } = {}) {
  const dir = join(root, 'proj', 'isle');
  await mkdir(join(dir, 'build'), { recursive: true });
  await writeFile(join(dir, TERRAIN_SPEC_FILE), JSON.stringify(TerrainSpecSchema.parse({ worldSize: 512 })));
  if (opts.drape) await writeFile(join(dir, 'build', 'drape.png'), encodePngRgba8(new Uint8Array(16 * 4).fill(9), 4, 4));
  if (opts.landcover) await writeFile(join(dir, 'build', 'landcover.png'), encodePngRgba8(new Uint8Array(16 * 4).fill(1), 4, 4));
}

describe('readTerrainSource', () => {
  it('reads the world size, the drape and the land cover', async () => {
    await terrain({ drape: true, landcover: true });
    const got = await readTerrainSource(root, 'proj', 'isle', noBake);
    if (!got.ok) throw new Error('fail');
    expect(got.value.worldSize).toBe(512);
    expect(got.value.drape.length).toBeGreaterThan(8);
    expect(got.value.landcover).not.toBeNull();
  });

  it('works without land cover', async () => {
    await terrain({ drape: true });
    const got = await readTerrainSource(root, 'proj', 'isle', noBake);
    expect(got).toMatchObject({ ok: true, value: { landcover: null } });
  });

  it('says the terrain is not built when it has neither a drape nor a splat bake', async () => {
    await terrain();
    expect(await readTerrainSource(root, 'proj', 'isle', noBake)).toMatchObject({ ok: false, message: TERRAIN_NOT_BUILT });
  });

  it('does not find a missing or escaping terrain', async () => {
    await terrain({ drape: true });
    expect(await readTerrainSource(root, 'proj', 'nope', noBake)).toMatchObject({ ok: false, message: 'Terrain not found.' });
    expect(await readTerrainSource(root, '..', 'etc', noBake)).toMatchObject({ ok: false });
    expect(await readTerrainSource(null, 'proj', 'isle', noBake)).toMatchObject({ ok: false });
  });
});
