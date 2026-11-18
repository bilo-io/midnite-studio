import { readFile, stat } from 'node:fs/promises';
import { extname, posix } from 'node:path';

import { GAME_ASSET_INDEX_FILE, GameAssetIndexSchema, GAME_LEVEL_PROPS, levelProperties, type GameLevel, type GameLevelTerrain } from '@midnite/studio-shared';
import { confineToRoot } from '@midnite/studio-runtime';
import { z } from 'zod';

import { cachedDrapePreview, downscalePng } from './drape-preview';
import { readTerrainDetail, workExtent } from './terrain-detail';

/** The drape image is only a backdrop for the plan view; a bigger PNG is downscaled (`drape-preview.ts`) rather than shipped whole over IPC (the editor re-reads a level on focus, so it is sent often). */
const PREVIEW_MAX_BYTES = 1024 * 1024;
const PREVIEW_TYPES: Record<string, string> = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

/** Only the part of `terrain.manifest.json` the plan view needs; readers ignore the rest. */
const PackExtent = z.object({
  bounds: z.object({ min: z.tuple([z.number(), z.number(), z.number()]), max: z.tuple([z.number(), z.number(), z.number()]) }),
  maps: z.object({ drape: z.string().optional() }).optional(),
  roads: z.string().optional(),
  buildings: z.string().optional(),
});

/**
 * The terrain a 3D level names with `midnite.terrain` (Phase 132 Theme E), as an extent: the asset's pack manifest
 * gives its bounds in metres and, when it carries one, a drape image to draw under the outline. `null` when the
 * level names none, the asset is not in `assets/index.json`, or the pack cannot be read: the editor then draws no
 * outline, and the level still opens. Every path is confined to the game's folder.
 */
export async function readLevelTerrain(gamePath: string, level: Pick<GameLevel, 'properties'> & Partial<Pick<GameLevel, 'width' | 'height' | 'tilewidth' | 'tileheight' | 'layers'>>): Promise<GameLevelTerrain | null> {
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
    let drapePng: string | null = null;
    const inPack = (file: string | undefined): Promise<string | null> => (file ? confineToRoot(gamePath, posix.join(posix.dirname(manifestRel), file.split('\\').join('/'))) : Promise.resolve(null));
    const drape = pack.maps?.drape;
    const mime = drape ? PREVIEW_TYPES[extname(drape).toLowerCase()] : undefined;
    if (drape && mime) {
      const real = await confineToRoot(gamePath, posix.join(posix.dirname(manifestRel), drape.split('\\').join('/')));
      if (real !== null) {
        if (mime === 'image/png') drapePng = real;
        const info = await stat(real);
        if (info.size <= PREVIEW_MAX_BYTES) preview = `data:${mime};base64,${(await readFile(real)).toString('base64')}`;
        // A big PNG drape is shown downscaled, made once per file version. A big JPEG or WebP has no decoder here and is left out.
        else if (mime === 'image/png') preview = await cachedDrapePreview(real, info, async () => downscalePng(await readFile(real)));
      }
    }
    const extent = { minX: pack.bounds.min[0], minZ: pack.bounds.min[2], maxX: pack.bounds.max[0], maxZ: pack.bounds.max[2] };
    // A level much smaller than its terrain also gets the part it works in, in detail (`terrain-detail.ts`).
    const { width, height, tilewidth, tileheight, layers } = level;
    const area = width && height && tilewidth && tileheight && layers ? workExtent({ width, height, tilewidth, tileheight, layers, properties: level.properties }, extent) : null;
    const detail = area ? await readTerrainDetail({ drapePng, roads: await inPack(pack.roads), buildings: await inPack(pack.buildings) }, extent, area) : undefined;
    return { name, ...extent, preview, ...(detail ? { detail } : {}) };
  } catch {
    return null;
  }
}
