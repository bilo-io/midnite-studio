import { readFile, stat } from 'node:fs/promises';
import { extname, posix } from 'node:path';

import { GAME_ASSET_INDEX_FILE, GameAssetIndexSchema, GAME_LEVEL_PROPS, GAME_LEVEL_TERRAIN_DETAIL_MAX_SIDE, levelProperties, terrainPlacements, type GameLevel, type GameLevelTerrain, type GameLevelTerrainDetail, type GameLevelTerrainPack, type TerrainPlacement } from '@midnite/studio-shared';
import { confineToRoot } from '@midnite/studio-runtime';
import { z } from 'zod';

import { cachedDrapePreview, downscalePng } from './drape-preview';
import { readTerrainDetail, workExtent, type Extent } from './terrain-detail';
import { heightsOver, readHeightSource } from './terrain-heights';

/** The drape image is only a backdrop for the plan view; a bigger PNG is downscaled (`drape-preview.ts`) rather than shipped whole over IPC (the editor re-reads a level on focus, so it is sent often). */
const PREVIEW_MAX_BYTES = 1024 * 1024;
const PREVIEW_TYPES: Record<string, string> = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

/** Only the part of `terrain.manifest.json` the plan view needs; readers ignore the rest. */
const PackExtent = z.object({
  bounds: z.object({ min: z.tuple([z.number(), z.number(), z.number()]), max: z.tuple([z.number(), z.number(), z.number()]) }),
  maps: z.object({ drape: z.string().optional() }).optional(),
  roads: z.string().optional(),
  buildings: z.string().optional(),
  heightfield: z.object({ png: z.string().optional(), json: z.string().optional() }).optional(),
  heightRange: z.tuple([z.number(), z.number()]).optional(),
});

type PackEntry = { path: string; entry?: string | undefined };

/** A terrain asset's manifest, its drape as a preview (and the PNG's path, for crops), and a resolver for its other files. `null` when it cannot be read. */
async function readPack(gamePath: string, entry: PackEntry): Promise<{ pack: z.infer<typeof PackExtent>; preview: string | null; drapePng: string | null; inPack: (file: string | undefined) => Promise<string | null> } | null> {
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
  return { pack, preview, drapePng, inPack };
}

/** A further pack over the rectangle the level places it in: its drape and coarse heights, relabelled from its own frame. `null` when it cannot be read. */
async function readPlacedPack(gamePath: string, entry: PackEntry | undefined, placed: TerrainPlacement): Promise<GameLevelTerrainPack | null> {
  if (!entry) return null;
  try {
    const read = await readPack(gamePath, entry);
    if (!read) return null;
    const own = { minX: read.pack.bounds.min[0], minZ: read.pack.bounds.min[2], maxX: read.pack.bounds.max[0], maxZ: read.pack.bounds.max[2] };
    const source = await readHeightSource({ png: await read.inPack(read.pack.heightfield?.png), json: await read.inPack(read.pack.heightfield?.json) }, read.pack.heightRange ?? null);
    const heights = source ? heightsOver(source, own, own) : null;
    const { minX, minZ, maxX, maxZ } = placed;
    return { name: placed.name, minX, minZ, maxX, maxZ, preview: read.preview, ...(heights ? { heights: { ...heights, minX, minZ, maxX, maxZ } } : {}) };
  } catch {
    return null;
  }
}

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
    const read = await readPack(gamePath, entry);
    if (!read) return null;
    const { pack, preview, drapePng, inPack } = read;
    const extent = { minX: pack.bounds.min[0], minZ: pack.bounds.min[2], maxX: pack.bounds.max[0], maxZ: pack.bounds.max[2] };
    // A level much smaller than its terrain also gets the part it works in, in detail (`terrain-detail.ts`).
    const { width, height, tilewidth, tileheight, layers } = level;
    const area = width && height && tilewidth && tileheight && layers ? workExtent({ width, height, tilewidth, tileheight, layers, properties: level.properties }, extent) : null;
    const detail = area ? await readTerrainDetail({ drapePng, roads: await inPack(pack.roads), buildings: await inPack(pack.buildings) }, extent, area) : undefined;
    // The ground's heights, when the pack has a heightfield: coarse over the whole terrain, at its own spacing over the detail.
    const source = await readHeightSource({ png: await inPack(pack.heightfield?.png), json: await inPack(pack.heightfield?.json) }, pack.heightRange ?? null);
    const heights = source ? heightsOver(source, extent, extent) : null;
    const detailHeights = source && detail ? heightsOver(source, extent, detail) : null;
    const packs: GameLevelTerrainPack[] = [];
    for (const placed of terrainPlacements(levelProperties(level)[GAME_LEVEL_PROPS.terrainPacks])) {
      if (placed.name === name) continue;
      const more = await readPlacedPack(gamePath, index.assets.find((a) => a.kind === 'terrain' && a.name === placed.name), placed);
      if (more) packs.push(more);
    }
    return { name, ...extent, preview, ...(detail ? { detail: detailHeights ? { ...detail, heights: detailHeights } : detail } : {}), ...(heights ? { heights } : {}), ...(packs.length > 0 ? { packs } : {}) };
  } catch {
    return null;
  }
}

/** A detail read in a pack's own frame, moved to where the level places the pack (`own` → `placed`). The frames differ by a shift and a slight scale. */
export function placeDetail(detail: GameLevelTerrainDetail, own: Extent, placed: Extent): GameLevelTerrainDetail {
  const sx = (placed.maxX - placed.minX) / (own.maxX - own.minX), sz = (placed.maxZ - placed.minZ) / (own.maxZ - own.minZ);
  const x = (v: number): number => Math.round((placed.minX + (v - own.minX) * sx) * 10) / 10, z = (v: number): number => Math.round((placed.minZ + (v - own.minZ) * sz) * 10) / 10;
  const points = (p: readonly number[]): number[] => p.map((v, i) => (i % 2 === 0 ? x(v) : z(v)));
  const rect = <T extends Extent>(r: T): T => ({ ...r, minX: x(r.minX), minZ: z(r.minZ), maxX: x(r.maxX), maxZ: z(r.maxZ) });
  return { ...rect(detail), roads: detail.roads.map((r) => ({ ...r, points: points(r.points) })), buildings: detail.buildings.map(points), ...(detail.heights ? { heights: rect(detail.heights) } : {}) };
}

/**
 * The detail of the terrain under `area` (world metres) for a level too large for one detail: the terrain itself
 * when the area's centre is on it, else the first of the level's packs that holds the centre. The area is clamped
 * to that pack. `null` when none lies under it, the area is over {@link GAME_LEVEL_TERRAIN_DETAIL_MAX_SIDE} a side,
 * or nothing can be read.
 */
export async function readLevelTerrainDetail(gamePath: string, level: Pick<GameLevel, 'properties'>, area: Extent): Promise<GameLevelTerrainDetail | null> {
  const name = levelProperties(level)[GAME_LEVEL_PROPS.terrain];
  if (typeof name !== 'string' || name === '') return null;
  if (!(area.maxX > area.minX && area.maxZ > area.minZ) || Math.max(area.maxX - area.minX, area.maxZ - area.minZ) > GAME_LEVEL_TERRAIN_DETAIL_MAX_SIDE) return null;
  try {
    const index = GameAssetIndexSchema.parse(JSON.parse(await readFile((await confineToRoot(gamePath, GAME_ASSET_INDEX_FILE)) ?? '', 'utf8')));
    const cx = (area.minX + area.maxX) / 2, cz = (area.minZ + area.maxZ) / 2;
    // The terrain first (its own frame is the world's), then each pack over the rectangle the level gives it.
    const candidates: Array<{ name: string; placed: Extent | null }> = [{ name, placed: null }, ...terrainPlacements(levelProperties(level)[GAME_LEVEL_PROPS.terrainPacks]).filter((p) => p.name !== name).map((p) => ({ name: p.name, placed: p as Extent }))];
    for (const candidate of candidates) {
      const entry = index.assets.find((a) => a.kind === 'terrain' && a.name === candidate.name);
      if (!entry) continue;
      const read = await readPack(gamePath, entry);
      if (!read) continue;
      const own = { minX: read.pack.bounds.min[0], minZ: read.pack.bounds.min[2], maxX: read.pack.bounds.max[0], maxZ: read.pack.bounds.max[2] };
      const placed = candidate.placed ?? own;
      if (cx < placed.minX || cx > placed.maxX || cz < placed.minZ || cz > placed.maxZ) continue;
      // The asked area in the pack's own frame, clamped to it.
      const sx = (own.maxX - own.minX) / (placed.maxX - placed.minX), sz = (own.maxZ - own.minZ) / (placed.maxZ - placed.minZ);
      const local = {
        minX: Math.max(own.minX, own.minX + (area.minX - placed.minX) * sx),
        minZ: Math.max(own.minZ, own.minZ + (area.minZ - placed.minZ) * sz),
        maxX: Math.min(own.maxX, own.minX + (area.maxX - placed.minX) * sx),
        maxZ: Math.min(own.maxZ, own.minZ + (area.maxZ - placed.minZ) * sz),
      };
      if (!(local.maxX > local.minX && local.maxZ > local.minZ)) return null;
      const detail = await readTerrainDetail({ drapePng: read.drapePng, roads: await read.inPack(read.pack.roads), buildings: await read.inPack(read.pack.buildings) }, own, local);
      const source = await readHeightSource({ png: await read.inPack(read.pack.heightfield?.png), json: await read.inPack(read.pack.heightfield?.json) }, read.pack.heightRange ?? null);
      const heights = source ? heightsOver(source, own, detail) : null;
      const full = heights ? { ...detail, heights } : detail;
      return candidate.placed ? placeDetail(full, own, placed) : full;
    }
    return null;
  } catch {
    return null;
  }
}
