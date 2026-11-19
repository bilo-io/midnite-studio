import { readFile, stat } from 'node:fs/promises';

import { decodePng } from '@midnite/studio-runtime';
import { GAME_LEVEL_HEIGHTS_MAX_SIDE, type GameLevelHeights } from '@midnite/studio-shared';

import type { Extent } from './terrain-detail';

/** A pack's heightfield as read: one sample per vertex over the whole terrain, `0…top` mapping to `range` metres. */
export type HeightSource = { width: number; height: number; values: ArrayLike<number>; top: number; range: readonly [number, number] };

/** A level may place several packs round its terrain, and each is decoded once. */
const CACHE_MAX = 10;
const cache = new Map<string, HeightSource | null>();

/** For tests. */
export function clearTerrainHeightsCache(): void {
  cache.clear();
}

/**
 * A pack's `heightfield.png` (greyscale, 8 or 16 bit) with the metres its range stands for: `heightfield.json`'s
 * `heightRange`, else `fallbackRange` (the manifest's). `null` when either is missing or unreadable. Decoded once
 * per file version.
 */
export async function readHeightSource(files: { png: string | null; json: string | null }, fallbackRange: readonly [number, number] | null): Promise<HeightSource | null> {
  if (files.png === null) return null;
  try {
    const info = await stat(files.png);
    const key = `${files.png}:${info.mtimeMs}:${info.size}:${files.json ?? '-'}:${fallbackRange?.join(',') ?? '-'}`;
    if (cache.has(key)) return cache.get(key) ?? null;
    let range = fallbackRange;
    if (files.json !== null) {
      try {
        const stated = (JSON.parse(await readFile(files.json, 'utf8')) as { heightRange?: unknown }).heightRange;
        if (Array.isArray(stated) && typeof stated[0] === 'number' && typeof stated[1] === 'number') range = [stated[0], stated[1]];
      } catch {
        // The manifest's range stands.
      }
    }
    let source: HeightSource | null = null;
    const decoded = range && Number.isFinite(range[0]) && Number.isFinite(range[1]) && range[1] > range[0] ? decodePng(await readFile(files.png)) : null;
    if (decoded?.ok && range && decoded.image.width >= 2 && decoded.image.height >= 2) {
      const { image } = decoded;
      // The first channel is the height: a heightfield is greyscale, and a colour one repeats it.
      const values = image.channels === 1 ? image.data : image.data.filter((_, i) => i % image.channels === 0);
      source = { width: image.width, height: image.height, values, top: image.bitDepth === 16 ? 65535 : 255, range };
    }
    cache.set(key, source);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
    return source;
  } catch {
    return null;
  }
}

/**
 * The ground over `area` (inside `terrain`, which the source spans edge to edge) as a grid at the source's own
 * spacing, or coarser when that would exceed `maxSide` vertices a side. Bilinear between source samples.
 */
export function heightsOver(source: HeightSource, terrain: Extent, area: Extent, maxSide: number = GAME_LEVEL_HEIGHTS_MAX_SIDE): GameLevelHeights | null {
  const tw = terrain.maxX - terrain.minX, th = terrain.maxZ - terrain.minZ;
  const aw = area.maxX - area.minX, ah = area.maxZ - area.minZ;
  if (!(tw > 0 && th > 0 && aw > 0 && ah > 0)) return null;
  const side = (span: number, whole: number, samples: number): number => Math.max(2, Math.min(maxSide, Math.round((span / whole) * (samples - 1)) + 1));
  const cols = side(aw, tw, source.width), rows = side(ah, th, source.height);
  const out = Buffer.alloc(cols * rows * 2);
  const scale = 65535 / source.top;
  for (let j = 0; j < rows; j += 1) {
    const fz = Math.min(source.height - 1, Math.max(0, ((area.minZ + (j / (rows - 1)) * ah - terrain.minZ) / th) * (source.height - 1)));
    const z0 = Math.min(source.height - 2, Math.floor(fz)), tz = fz - z0;
    for (let i = 0; i < cols; i += 1) {
      const fx = Math.min(source.width - 1, Math.max(0, ((area.minX + (i / (cols - 1)) * aw - terrain.minX) / tw) * (source.width - 1)));
      const x0 = Math.min(source.width - 2, Math.floor(fx)), tx = fx - x0;
      const at = (x: number, z: number): number => source.values[z * source.width + x] as number;
      const v = (at(x0, z0) * (1 - tx) + at(x0 + 1, z0) * tx) * (1 - tz) + (at(x0, z0 + 1) * (1 - tx) + at(x0 + 1, z0 + 1) * tx) * tz;
      out.writeUInt16LE(Math.max(0, Math.min(65535, Math.round(v * scale))), (j * cols + i) * 2);
    }
  }
  return { minX: area.minX, minZ: area.minZ, maxX: area.maxX, maxZ: area.maxZ, cols, rows, min: source.range[0], max: source.range[1], data: out.toString('base64') };
}
