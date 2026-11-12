import SimWorker from './sim.worker?worker&inline';

import { createUseSim, type SimWorkerFactory } from './use-sim';

// A packaged renderer loads from file://, so the worker is inlined (`?worker&inline`, see packages/app/vite.config.ts).
const factory: SimWorkerFactory | null = typeof Worker === 'undefined' ? null : () => new SimWorker() as unknown as ReturnType<SimWorkerFactory>;

/** The app's sim hook; a no-op where there is no `Worker` (jsdom). */
export const useSim = createUseSim(factory);
