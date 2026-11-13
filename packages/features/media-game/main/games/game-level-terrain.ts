import { readFile, stat } from 'node:fs/promises';
import { extname, posix } from 'node:path';

import { GAME_ASSET_INDEX_FILE, GameAssetIndexSchema, GAME_LEVEL_PROPS, levelProperties, type GameLevel, type GameLevelTerrain } from '@midnite/studio-shared';
import { confineToRoot } from '@midnite/studio-runtime';
import { z } from 'zod';

/** The drape image is only a backdrop for the plan view; a bigger one is left out rather than shipped over IPC (the editor re-reads a level on focus, so it is sent often). */
const PREVIEW_MAX_BYTES = 1024 * 1024;
const PREVIEW_TYPES: Record<string, string> = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

/** Only the part of `terrain.manifest.json` the plan view needs; readers ignore the rest. */
const PackExtent = z.object({
  bounds: z.object({ min: z.tuple([z.number(), z.number(), z.number()]), max: z.tuple([z.number(), z.number(), z.number()]) }),
  maps: z.object({ drape: z.string().optional() }).optional(),
});

/**
 * The terrain a 3D level names with `midnite.terrain` (Phase 132 Theme E), as an extent: the asset's pack manifest
 * gives its bounds in metres and, when it carries one, a drape image to draw under the outline. `null` when the
 * level names none, the asset is not in `assets/index.json`, or the pack cannot be read: the editor then draws no
 * outline, and the level still opens. Every path is confined to the game's folder.
 */
export async function readLevelTerrain(gamePath: string, level: Pick<GameLevel, 'properties'>): Promise<GameLevelTerrain | null> {
  const name = levelProperties(level)[GAME_LEVEL_PROPS.terrain];
  if (typeof name !== 'string' || name === '') return null;
  try {
    const index = GameAssetIndexSchema.parse(JSON.parse(await readFile((await confineToRoot(gamePath, GAME_ASSET_INDEX_FILE)) ?? '', 'utf8')));
    const entry = index.assets.find((a) => a.kind === 'terrain' && a.name === name);
    if (!entry) return null;
    const manifestRel = posix.join(entry.path, entry.entry ?? 'terrain.manifest.json');
    const manifestPath = await confineToRoot(gamePath, manifestRel);
    if (manifestPath === null) return null;
    const pack = PackExtent.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
    let preview: string | null = null;
    const drape = pack.maps?.drape;
    const mime = drape ? PREVIEW_TYPES[extname(drape).toLowerCase()] : undefined;
    if (drape && mime) {
      const real = await confineToRoot(gamePath, posix.join(posix.dirname(manifestRel), drape.split('\\').join('/')));
      if (real !== null && (await stat(real)).size <= PREVIEW_MAX_BYTES) preview = `data:${mime};base64,${(await readFile(real)).toString('base64')}`;
    }
    return { name, minX: pack.bounds.min[0], minZ: pack.bounds.min[2], maxX: pack.bounds.max[0], maxZ: pack.bounds.max[2], preview };
  } catch {
    return null;
  }
}
