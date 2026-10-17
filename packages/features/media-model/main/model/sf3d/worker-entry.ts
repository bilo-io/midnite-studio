/**
 * What the `sf3d-worker` utility process imports (Phase 113 Theme S) — the ONNX inference, the pipeline and
 * its protocol, and nothing else. A separate entry so the worker's bundle does not inline the feature's whole
 * main half (and, through it, the runtime layer) for a handful of names.
 */
export { createOrtInference, loadSf3dAssets, type OrtModule } from './ort-inference';
export { runSf3dPipeline, type Sf3dAssets, type Sf3dInference } from './pipeline';
export type { Sf3dWorkerIn, Sf3dWorkerOut } from './worker-protocol';
