/**
 * What the `map-capture-worker` utility process imports (Phase 113 Theme S) — the message loop and its
 * protocol, and nothing else. A separate entry so the worker's bundle does not inline the feature's whole
 * main half (and, through it, the runtime layer) for two names.
 */
export { createCaptureDispatcher } from './capture-dispatch';
export type { CaptureWorkerIn, CaptureWorkerOut } from './capture-protocol';
