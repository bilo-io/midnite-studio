/**
 * What the `music-worker` utility process imports (Phase 113 Theme Q) — the model
 * lifecycle and the message protocol, and nothing else. A separate entry so the
 * worker's bundle does not inline the feature's whole main half (and, through it,
 * the runtime layer) for two names.
 */
export { createMusicRuntime } from './runtime';
export type { MusicWorkerIn, MusicWorkerOut } from './worker-protocol';
