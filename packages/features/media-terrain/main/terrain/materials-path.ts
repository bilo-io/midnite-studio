import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `resources/terrain-materials/` — CC0 PBR material tiles (Phase 105 Theme F).
 *
 * Packaged: `extraResources` copies `resources/terrain-materials` to `process.resourcesPath/terrain-materials`.
 * Unpackaged / dev: `packages/desktop/resources/terrain-materials`. `MSTUDIO_TERRAIN_MATERIALS_DIR` wins
 * over both — an app that ships the tiles elsewhere (Gamer) points at them with it.
 *
 * No `electron` (Phase 113 Theme S): this runs in the build worker, and a feature's main half may not
 * import it. `app.isPackaged` was only ever true where `resourcesPath/terrain-materials` exists.
 */
export function terrainMaterialsDir(dirname: string = __dirname): string {
  if (process.env['MSTUDIO_TERRAIN_MATERIALS_DIR']) return process.env['MSTUDIO_TERRAIN_MATERIALS_DIR'];
  const packaged = process.resourcesPath ? join(process.resourcesPath, 'terrain-materials') : '';
  if (packaged && existsSync(packaged)) return packaged;

  // In development: from dist/main/media/terrain or src/main/media/terrain to packages/desktop/resources/terrain-materials
  const candidate1 = join(dirname, '..', '..', '..', '..', 'resources', 'terrain-materials');
  if (existsSync(candidate1)) return candidate1;

  const candidate2 = join(dirname, '..', '..', '..', 'resources', 'terrain-materials');
  if (existsSync(candidate2)) return candidate2;

  return candidate1;
}
