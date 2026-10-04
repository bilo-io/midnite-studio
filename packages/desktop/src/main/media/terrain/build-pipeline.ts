import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  buildHeightfield,
  chunkLayout,
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
  if (!heightmap) throw new TerrainBuildError('Noise terrains are not available yet — attach a heightmap.');
  const warnings: string[] = [];

  onProgress('decode', 0);
  const bytes = await readFile(join(job.dir, heightmap.file)).catch(() => {
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
  const stats = heightfieldStats(field);
  onProgress('heightfield', 1);

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
