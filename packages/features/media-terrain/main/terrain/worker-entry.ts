/**
 * What the `terrain-worker` utility process imports (Phase 113 Theme S) — the build and its protocol, and
 * nothing else. A separate entry so the worker's bundle does not inline the feature's whole main half (and,
 * through it, the runtime layer) for three names.
 */
export { runTerrainBuild } from './build-pipeline';
export type { TerrainWorkerIn, TerrainWorkerOut } from './worker-protocol';
