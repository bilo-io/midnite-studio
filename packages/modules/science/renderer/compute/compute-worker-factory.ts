import ComputeWorker from './compute.worker?worker&inline';

import { createUseCompute, type ComputeWorkerFactory } from './use-compute';

// A packaged renderer loads from file://, so the worker is inlined (`?worker&inline`, see packages/app/vite.config.ts).
const factory: ComputeWorkerFactory | null = typeof Worker === 'undefined' ? null : () => new ComputeWorker() as unknown as ReturnType<ComputeWorkerFactory>;

/** The app's compute hook; a no-op where there is no `Worker` (jsdom). */
export const useCompute = createUseCompute(factory);
