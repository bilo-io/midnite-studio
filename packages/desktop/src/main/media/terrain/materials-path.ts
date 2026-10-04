import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { app } from 'electron';

/**
 * `resources/terrain-materials/` — CC0 PBR material tiles (Phase 105 Theme F).
 *
 * Packaged: `extraResources` copies `resources/terrain-materials` to `process.resourcesPath/terrain-materials`.
 * Unpackaged / dev: `packages/desktop/resources/terrain-materials`.
 */
export function terrainMaterialsDir(): string {
  if (process.env['MSTUDIO_TERRAIN_MATERIALS_DIR']) return process.env['MSTUDIO_TERRAIN_MATERIALS_DIR'];
  const packaged = process.resourcesPath ? join(process.resourcesPath, 'terrain-materials') : '';
  if (app?.isPackaged || (packaged && existsSync(packaged))) return packaged;

  // In development: from dist/main/media/terrain or src/main/media/terrain to packages/desktop/resources/terrain-materials
  const candidate1 = join(__dirname, '..', '..', '..', '..', 'resources', 'terrain-materials');
  if (existsSync(candidate1)) return candidate1;

  const candidate2 = join(__dirname, '..', '..', '..', 'resources', 'terrain-materials');
  if (existsSync(candidate2)) return candidate2;

  return candidate1;
}
