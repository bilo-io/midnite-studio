import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  buildHeightfield,
  chunkLayout,
  erode,
  fbmField,
  ridgedField,
  type Heightfield,
  chunksPerSide,
  chunkVerts,
  heightfieldStats,
  isNonSquare,
  NON_SQUARE_WARNING,
  TERRAIN_LOD_COUNT,
  toHeightSamples,
  type TerrainBuildStage,
  type TerrainChunksFile,
  type TerrainSpec,
  type TerrainStats,
} from '@midnite/studio-shared';

import { decodePng } from '../png/png-codec';

/**
 * The terrain build, as a plain async function — the `terrain-worker` utility process runs it, and so
 * does vitest. Theme B's stages: `decode` (the heightmap PNG), `heightfield` (resample, map to
 * metres) and `write` (`heights.f32`, `chunks.json`). Later themes add their stages to the same run.
 *
 * Nothing here is cancellable from inside: the loops are synchronous. A cancel kills the process.
 */
export type BuildJob = { dir: string; outDir: string; spec: TerrainSpec };

/** The stages a spec has work for, in order. `write` always runs. */
export function plannedStages(spec: TerrainSpec): TerrainBuildStage[] {
  const stages: TerrainBuildStage[] = [];
  if (spec.inputs.heightmap) stages.push('decode');
  stages.push('heightfield');
  if (!spec.inputs.heightmap && spec.noise && spec.noise.erosion.iterations > 0) stages.push('erosion');
  stages.push('write');
  return stages;
}

export class TerrainBuildError extends Error {}

export async function runTerrainBuild(
  job: BuildJob,
  onProgress: (stage: TerrainBuildStage, fraction: number) => void = () => undefined,
  now: () => number = Date.now,
): Promise<TerrainStats> {
  const started = now();
  const { spec } = job;
  const heightmap = spec.inputs.heightmap;
  if (!heightmap && !spec.noise) throw new TerrainBuildError('Nothing to shape the ground from — attach a heightmap or choose noise.');
  const warnings: string[] = [];
  let field: Heightfield;

  if (heightmap) {
    field = await heightfieldFromImage(job, heightmap.file, warnings, onProgress);
  } else {
    field = noiseHeightfield(spec, onProgress);
  }
  const stats = heightfieldStats(field);

  onProgress('write', 0);
  const out = join(job.dir, job.outDir);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'heights.f32'), Buffer.from(field.heights.buffer, field.heights.byteOffset, field.heights.byteLength));
  const chunks = chunkLayout(field);
  const chunksFile: TerrainChunksFile = {
    resolution: spec.resolution,
    worldSize: spec.worldSize,
    heightRange: [spec.heightRange[0], spec.heightRange[1]],
    chunkVerts: chunkVerts(spec.resolution),
    chunksPerSide: chunksPerSide(spec.resolution),
    lodCount: TERRAIN_LOD_COUNT,
    chunks,
  };
  await writeFile(join(out, 'chunks.json'), JSON.stringify(chunksFile));
  onProgress('write', 1);

  return {
    resolution: spec.resolution,
    worldSize: spec.worldSize,
    vertexCount: spec.resolution * spec.resolution,
    triangleCount: (spec.resolution - 1) * (spec.resolution - 1) * 2,
    chunkCount: chunks.length,
    lodCount: TERRAIN_LOD_COUNT,
    buildMs: Math.max(0, Math.round(now() - started)),
    minHeight: stats.min,
    maxHeight: stats.max,
    histogram: stats.histogram,
    warnings,
  };
}

async function heightfieldFromImage(
  job: BuildJob,
  file: string,
  warnings: string[],
  onProgress: (stage: TerrainBuildStage, fraction: number) => void,
): Promise<Heightfield> {
  const { spec } = job;
  onProgress('decode', 0);
  const bytes = await readFile(join(job.dir, file)).catch(() => {
    throw new TerrainBuildError('The heightmap file is missing — attach it again.');
  });
  const decoded = decodePng(bytes);
  if (!decoded.ok) throw new TerrainBuildError(decoded.message);
  const { image } = decoded;
  const height = toHeightSamples(image);
  warnings.push(...height.warnings);
  if (isNonSquare(image.width, image.height)) warnings.push(NON_SQUARE_WARNING);
  onProgress('decode', 1);

  onProgress('heightfield', 0);
  const field = buildHeightfield(height.samples, image.width, image.height, {
    resolution: spec.resolution,
    worldSize: spec.worldSize,
    heightRange: spec.heightRange,
    preSmooth: spec.preSmooth,
  });
  onProgress('heightfield', 1);
  return field;
}

/** No heightmap: fBm or ridged noise from the spec's seed, optionally eroded, mapped onto the height range. */
function noiseHeightfield(spec: TerrainSpec, onProgress: (stage: TerrainBuildStage, fraction: number) => void): Heightfield {
  const noise = spec.noise!;
  onProgress('heightfield', 0);
  const params = { seed: noise.seed, octaves: noise.octaves, frequency: noise.frequency, persistence: noise.persistence, lacunarity: noise.lacunarity, island: noise.island };
  let grid = noise.kind === 'ridged' ? ridgedField(spec.resolution, params) : fbmField(spec.resolution, params);
  onProgress('heightfield', 1);
  if (noise.erosion.iterations > 0) {
    onProgress('erosion', 0);
    grid = erode(grid, spec.resolution, { iterations: noise.erosion.iterations, seed: noise.seed }, (f) => onProgress('erosion', f)).heights;
    // Erosion moves mass around, so stretch the result back over the full range.
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < grid.length; i += 1) {
      min = Math.min(min, grid[i]!);
      max = Math.max(max, grid[i]!);
    }
    const span = max - min;
    if (span > 0) for (let i = 0; i < grid.length; i += 1) grid[i] = (grid[i]! - min) / span;
  }
  const [lo, hi] = spec.heightRange;
  const heights = new Float32Array(grid.length);
  for (let i = 0; i < grid.length; i += 1) heights[i] = lo + Math.min(1, Math.max(0, grid[i]!)) * (hi - lo);
  return { resolution: spec.resolution, worldSize: spec.worldSize, heights };
}
