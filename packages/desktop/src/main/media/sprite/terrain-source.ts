import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { failure, ok, parseTerrainSpec, TERRAIN_SPEC_FILE, type GitOpResult } from '@midnite/studio-shared';

import { confineToRoot } from '../../fs-scope';
import { bakeSplat } from '../terrain/terrain-export';
import type { TerrainSource } from './tileset';

/** The side of the splat bake used when a terrain has no satellite drape. */
export const SPLAT_BAKE_SIZE = 1024;
export const TERRAIN_NOT_BUILT = 'This terrain has not been built yet. Build it in Media ▸ Terrain first.';

/**
 * What a terrain-to-tiles job reads of a Phase 105 terrain (`terrain.json` and `build/`): the world
 * size, the drape (or, with none, a bake of the splat blend) and the land-cover classes. Read-only —
 * Phase 105's files and contracts are untouched.
 */
export async function readTerrainSource(root: string | null, project: string, terrain: string): Promise<GitOpResult<TerrainSource>> {
  if (!root) return failure('Terrain not found.');
  const dir = await confineToRoot(root, `${project}/${terrain}`);
  if (!dir) return failure('Terrain not found.');
  let worldSize: number;
  try {
    worldSize = parseTerrainSpec(JSON.parse(await readFile(join(dir, TERRAIN_SPEC_FILE), 'utf8'))).worldSize;
  } catch {
    return failure('Terrain not found.');
  }
  const build = join(dir, 'build');
  const drape = (await readFile(join(build, 'drape.png')).catch(() => null)) ?? (await bakeSplat({ build }, SPLAT_BAKE_SIZE).catch(() => null));
  if (!drape) return failure(TERRAIN_NOT_BUILT);
  const landcover = await readFile(join(build, 'landcover.png')).catch(() => null);
  return ok({ worldSize, drape, landcover });
}
