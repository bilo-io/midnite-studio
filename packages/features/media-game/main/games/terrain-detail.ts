import { readFile, stat } from 'node:fs/promises';

import { decodePng, encodePngRgba8 } from '@midnite/studio-runtime';
import { levelOrigin, metresPerTile, type GameLevel, type GameLevelTerrainDetail, type RasterImage } from '@midnite/studio-shared';

import { downscaleToRgba8 } from './drape-preview';

/** A level this much of its terrain's width (or more) gains nothing from a detail crop: the whole-terrain preview already serves it. */
export const DETAIL_MAX_SHARE = 0.5;
/** Room round the work on each side, as a share of its size. */
export const DETAIL_PADDING = 0.15;
export const DETAIL_MAX_SIDE = 1024;
/** Caps on what crosses IPC: past these the smallest roads and buildings are the ones dropped. */
export const DETAIL_MAX_ROADS = 6000;
export const DETAIL_MAX_BUILDINGS = 6000;
const CACHE_MAX = 4;

export type Extent = { minX: number; minZ: number; maxX: number; maxZ: number };

/**
 * Where a level works, in world metres: its map rectangle and every object, padded by {@link DETAIL_PADDING} and
 * clamped to the terrain. `null` when that is {@link DETAIL_MAX_SHARE} of the terrain or more, or misses it.
 */
export function workExtent(level: Pick<GameLevel, 'width' | 'height' | 'tilewidth' | 'tileheight' | 'layers' | 'properties'>, terrain: Extent): Extent | null {
  const mpt = metresPerTile(level), origin = levelOrigin(level);
  let minX = origin.x, minZ = origin.z, maxX = origin.x + level.width * mpt, maxZ = origin.z + level.height * mpt;
  for (const layer of level.layers) {
    const objects = (layer as { objects?: unknown }).objects;
    if (!Array.isArray(objects)) continue;
    for (const o of objects as Array<{ x?: unknown; y?: unknown }>) {
      if (typeof o.x !== 'number' || typeof o.y !== 'number' || !Number.isFinite(o.x) || !Number.isFinite(o.y)) continue;
      const x = origin.x + (o.x / level.tilewidth) * mpt, z = origin.z + (o.y / level.tileheight) * mpt;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
  }
  const padX = (maxX - minX) * DETAIL_PADDING, padZ = (maxZ - minZ) * DETAIL_PADDING;
  const out = { minX: Math.max(terrain.minX, minX - padX), minZ: Math.max(terrain.minZ, minZ - padZ), maxX: Math.min(terrain.maxX, maxX + padX), maxZ: Math.min(terrain.maxZ, maxZ + padZ) };
  if (out.maxX <= out.minX || out.maxZ <= out.minZ) return null;
  if (out.maxX - out.minX >= (terrain.maxX - terrain.minX) * DETAIL_MAX_SHARE && out.maxZ - out.minZ >= (terrain.maxZ - terrain.minZ) * DETAIL_MAX_SHARE) return null;
  return out;
}

/** The pixels of `image` in `[x0, x0+width) × [y0, y0+height)`, same channels and depth. */
export function cropRaster(image: RasterImage, x0: number, y0: number, width: number, height: number): RasterImage {
  const { channels } = image;
  const data = new (image.data.constructor as new (n: number) => RasterImage['data'])(width * height * channels);
  for (let y = 0; y < height; y += 1) {
    const from = ((y0 + y) * image.width + x0) * channels;
    data.set(image.data.subarray(from, from + width * channels), y * width * channels);
  }
  return { ...image, width, height, data };
}

/**
 * The part of a drape PNG over `area`, at the drape's own resolution (never enlarged; shrunk to
 * {@link DETAIL_MAX_SIDE} if larger). The image spans `terrain` with X to the right and Z down, as the plan draws it.
 * `null` when the PNG cannot be decoded or the area covers under two pixels.
 */
export function cropDrape(bytes: Uint8Array, terrain: Extent, area: Extent): { png: Buffer; extent: Extent } | null {
  const decoded = decodePng(bytes);
  if (!decoded.ok) return null;
  const { image } = decoded;
  const sx = image.width / (terrain.maxX - terrain.minX), sz = image.height / (terrain.maxZ - terrain.minZ);
  const x0 = Math.max(0, Math.floor((area.minX - terrain.minX) * sx)), x1 = Math.min(image.width, Math.ceil((area.maxX - terrain.minX) * sx));
  const y0 = Math.max(0, Math.floor((area.minZ - terrain.minZ) * sz)), y1 = Math.min(image.height, Math.ceil((area.maxZ - terrain.minZ) * sz));
  const width = x1 - x0, height = y1 - y0;
  if (width < 2 || height < 2) return null;
  const scale = Math.min(1, DETAIL_MAX_SIDE / Math.max(width, height));
  const outW = Math.max(1, Math.round(width * scale)), outH = Math.max(1, Math.round(height * scale));
  const png = encodePngRgba8(downscaleToRgba8(cropRaster(image, x0, y0, width, height), outW, outH), outW, outH);
  // The crop snaps to whole source pixels, so its true extent is a little wider than what was asked for.
  return { png, extent: { minX: terrain.minX + x0 / sx, minZ: terrain.minZ + y0 / sz, maxX: terrain.minX + x1 / sx, maxZ: terrain.minZ + y1 / sz } };
}

const round = (n: number): number => Math.round(n * 10) / 10;
const touches = (xs: number[], area: Extent): boolean => {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    minX = Math.min(minX, xs[i]!); maxX = Math.max(maxX, xs[i]!); minZ = Math.min(minZ, xs[i + 1]!); maxZ = Math.max(maxZ, xs[i + 1]!);
  }
  return maxX >= area.minX && minX <= area.maxX && maxZ >= area.minZ && minZ <= area.maxZ;
};
const finitePoint = (p: unknown, zIndex: number): [number, number] | null =>
  Array.isArray(p) && typeof p[0] === 'number' && typeof p[zIndex] === 'number' && Number.isFinite(p[0]) && Number.isFinite(p[zIndex]) ? [p[0], p[zIndex] as number] : null;

/** A pack's `roads.json` (`edges[].points` are `[x, y, z]` metres) as the roads touching `area`, widest kept when over the cap. Bad input reads as none. */
export function roadsIn(json: unknown, area: Extent): GameLevelTerrainDetail['roads'] {
  const edges = (json as { edges?: unknown } | null)?.edges;
  if (!Array.isArray(edges)) return [];
  const out: GameLevelTerrainDetail['roads'] = [];
  for (const e of edges as Array<{ points?: unknown; widthM?: unknown }>) {
    if (!Array.isArray(e?.points)) continue;
    const points: number[] = [];
    for (const p of e.points) {
      const at = finitePoint(p, 2);
      if (at) points.push(round(at[0]), round(at[1]));
    }
    if (points.length < 4 || !touches(points, area)) continue;
    out.push({ width: typeof e.widthM === 'number' && e.widthM > 0 ? e.widthM : 3, points });
  }
  return out.length <= DETAIL_MAX_ROADS ? out : out.sort((a, b) => b.width - a.width).slice(0, DETAIL_MAX_ROADS);
}

/**
 * A pack's `buildings.json` (`buildings[].polygon` is `[x, z]` metres, with `baseY` and `height`) as the footprints
 * touching `area`, largest kept when over the cap, and their `[baseY, height]` pairs in the same order (`null` when
 * any kept building states neither).
 */
export function buildingsWithHeights(json: unknown, area: Extent): { buildings: GameLevelTerrainDetail['buildings']; heights: number[] | null } {
  const buildings = (json as { buildings?: unknown } | null)?.buildings;
  if (!Array.isArray(buildings)) return { buildings: [], heights: null };
  let out: Array<{ points: number[]; base: number | null; height: number | null }> = [];
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
  for (const b of buildings as Array<{ polygon?: unknown; baseY?: unknown; height?: unknown }>) {
    if (!Array.isArray(b?.polygon)) continue;
    const points: number[] = [];
    for (const p of b.polygon) {
      const at = finitePoint(p, 1);
      if (at) points.push(round(at[0]), round(at[1]));
    }
    if (points.length >= 6 && touches(points, area)) out.push({ points, base: num(b.baseY), height: num(b.height) });
  }
  if (out.length > DETAIL_MAX_BUILDINGS) out = out.sort((a, b) => b.points.length - a.points.length).slice(0, DETAIL_MAX_BUILDINGS);
  const stated = out.length > 0 && out.every((b) => b.base !== null && b.height !== null && b.height > 0);
  return { buildings: out.map((b) => b.points), heights: stated ? out.flatMap((b) => [b.base as number, b.height as number]) : null };
}

/** {@link buildingsWithHeights}' footprints alone. */
export const buildingsIn = (json: unknown, area: Extent): GameLevelTerrainDetail['buildings'] => buildingsWithHeights(json, area).buildings;

/** Details by source files and area: an untouched pack and an unmoved level never re-read 10 MB of JSON. Oldest out past {@link CACHE_MAX}. */
const cache = new Map<string, GameLevelTerrainDetail>();

/** For tests. */
export function clearTerrainDetailCache(): void {
  cache.clear();
}

const stamp = async (path: string | null): Promise<string> => {
  if (path === null) return '-';
  try {
    const info = await stat(path);
    return `${path}:${info.mtimeMs}:${info.size}`;
  } catch {
    return '-';
  }
};
const readJson = async (path: string | null): Promise<unknown> => {
  if (path === null) return null;
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
};

/**
 * The detail for `area` from a pack's already-confined files (each `null` when the pack has none). The drape is
 * cropped only when it is a PNG; a missing or unreadable part is left out and the rest still comes through.
 */
export async function readTerrainDetail(files: { drapePng: string | null; roads: string | null; buildings: string | null }, terrain: Extent, area: Extent): Promise<GameLevelTerrainDetail> {
  const key = [await stamp(files.drapePng), await stamp(files.roads), await stamp(files.buildings), area.minX, area.minZ, area.maxX, area.maxZ].join('\0');
  const hit = cache.get(key);
  if (hit) return hit;
  let preview: string | null = null, extent: Extent = area;
  if (files.drapePng !== null) {
    try {
      const crop = cropDrape(await readFile(files.drapePng), terrain, area);
      if (crop) {
        preview = `data:image/png;base64,${crop.png.toString('base64')}`;
        extent = crop.extent;
      }
    } catch {
      preview = null;
    }
  }
  const built = buildingsWithHeights(await readJson(files.buildings), area);
  const detail: GameLevelTerrainDetail = { ...extent, preview, roads: roadsIn(await readJson(files.roads), area), buildings: built.buildings, ...(built.heights ? { buildingHeights: built.heights } : {}) };
  cache.set(key, detail);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return detail;
}
