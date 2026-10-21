import {
  TerrainBuildingsFileSchema,
  TerrainFoliageFileSchema,
  TerrainRoadsFileSchema,
  type TerrainBuildingsFile,
  type TerrainFoliageFile,
  type TerrainRoadsFile,
} from '@midnite/studio-shared';

/**
 * The data half of the viewer's feature layers (Phase 105 Themes G + H): reading `build/roads.json`,
 * `build/buildings.json` and `build/foliage.json`, and bucketing foliage instances by (asset, chunk).
 * Three-free, so it is plain vitest.
 */
export type TerrainLayersData = {
  roads: TerrainRoadsFile | null;
  buildings: TerrainBuildingsFile | null;
  foliage: TerrainFoliageFile | null;
};

/** Instances farther than this (plus the bucket's own radius) from the camera are not drawn. */
export const FOLIAGE_DRAW_DISTANCE_M = 600;

async function readJson<T>(url: string, parse: (value: unknown) => T): Promise<T | null> {
  try {
    const res = await fetch(url);
    // A build without roads (or satellite) simply has no file: a 404 is "no layer", not an error.
    if (!res.ok) return null;
    return parse(await res.json());
  } catch {
    return null;
  }
}

export async function loadLayers(base: string, version: string): Promise<TerrainLayersData> {
  const q = `?v=${encodeURIComponent(version)}`;
  const [roads, buildings, foliage] = await Promise.all([
    readJson(`${base}/roads.json${q}`, (v) => TerrainRoadsFileSchema.parse(v)),
    readJson(`${base}/buildings.json${q}`, (v) => TerrainBuildingsFileSchema.parse(v)),
    readJson(`${base}/foliage.json${q}`, (v) => TerrainFoliageFileSchema.parse(v)),
  ]);
  return { roads, buildings, foliage };
}

/** One instanced draw: every instance of one asset inside one chunk. */
export type FoliageBucket = {
  asset: number;
  cx: number;
  cz: number;
  /** World-space centre of the chunk on the ground plane, for distance culling. */
  centre: [number, number];
  /** Packed `[x, y, z, yaw, scale]` per instance. */
  instances: number[];
};

/**
 * Groups `foliage.json`'s instances by (asset, chunk) on a `chunksPerSide`² grid over a terrain
 * centred on the origin. Instances on (or past) the outer edge clamp into the border chunk.
 */
export function groupFoliageByChunk(file: TerrainFoliageFile, worldSize: number, chunksPerSide: number): FoliageBucket[] {
  const n = Math.max(1, Math.floor(chunksPerSide));
  const cell = worldSize / n;
  const half = worldSize / 2;
  const buckets = new Map<string, FoliageBucket>();
  for (const [asset, x, y, z, yaw, scale] of file.instances) {
    const cx = Math.min(n - 1, Math.max(0, Math.floor((x + half) / cell)));
    const cz = Math.min(n - 1, Math.max(0, Math.floor((z + half) / cell)));
    const key = `${asset}:${cx}:${cz}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { asset, cx, cz, centre: [-half + (cx + 0.5) * cell, -half + (cz + 0.5) * cell], instances: [] };
      buckets.set(key, bucket);
    }
    bucket.instances.push(x, y, z, yaw, scale);
  }
  return [...buckets.values()];
}

/** Whether a bucket of chunk-sized extent `cell` is within the draw distance of a camera at (x, z). */
export function bucketInRange(bucket: FoliageBucket, cell: number, cameraX: number, cameraZ: number, drawDistance = FOLIAGE_DRAW_DISTANCE_M): boolean {
  const radius = (cell * Math.SQRT2) / 2;
  return Math.hypot(bucket.centre[0] - cameraX, bucket.centre[1] - cameraZ) - radius <= drawDistance;
}
