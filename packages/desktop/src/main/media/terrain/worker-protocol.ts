import type { TerrainBuildStage, TerrainSpec, TerrainStats } from '@midnite/studio-shared';

/**
 * The messages between `terrain-broker.ts` and `terrain-worker`. The worker reads `inputs/*.png`
 * and writes its outputs itself, so no multi-megabyte array ever crosses IPC.
 */
export type TerrainWorkerIn = {
  type: 'build';
  id: string;
  /** Absolute path of the terrain folder (`.../<group>/<terrain>`). */
  dir: string;
  spec: TerrainSpec;
  /** Where the outputs are written, relative to `dir` — main swaps it over `build/` on success. */
  outDir: string;
  /** The stages that will run, in order, so the worker's progress fractions can be spread over them. */
  stages: TerrainBuildStage[];
};

export type TerrainWorkerOut =
  | { type: 'progress'; id: string; stage: TerrainBuildStage; fraction: number }
  | { type: 'reply'; id: string; ok: true; stats: TerrainStats }
  | { type: 'reply'; id: string; ok: false; message: string };
