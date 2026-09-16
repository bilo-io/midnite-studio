import { parentPort, workerData } from 'node:worker_threads';

import { extractPositions, runForceAtlas2, toGraphologyGraph } from './layout';
import type { LayoutPositions, LeanGraph } from './types';

/**
 * The `worker_threads` entry point for a cold ForceAtlas2 pass (Theme B,
 * Decision 3 — `worker_threads` over `utilityProcess`, so the layout stays
 * inside this electron-free package where its tests live).
 *
 * `packages/desktop`'s handler spawns this file directly out of
 * `@midnite/studio-knowledge`'s built `dist/` — it is a plain CommonJS module
 * (this package's `tsconfig.json` targets `commonjs`), so `new Worker(path)`
 * needs nothing bundled or transpiled further.
 *
 * Message protocol, worker → main thread:
 *   `{type: 'progress', done, total}` — after each ForceAtlas2 batch.
 *   `{type: 'done', positions}` — the final layout.
 *   `{type: 'error', message}` — the pass threw; the caller falls back to
 *   reporting a plain error rather than hanging on a worker that never posts.
 */
export type LayoutWorkerData = {
  lean: LeanGraph;
  totalIterations: number;
  batchSize: number;
};

export type LayoutWorkerMessage =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; positions: LayoutPositions }
  | { type: 'error'; message: string };

function run(): void {
  if (!parentPort) {
    throw new Error('layout-worker.ts must be run inside a worker_threads Worker.');
  }
  const port = parentPort;
  const { lean, totalIterations, batchSize } = workerData as LayoutWorkerData;

  try {
    const graph = toGraphologyGraph(lean);
    runForceAtlas2(graph, totalIterations, batchSize, (done, total) => {
      const message: LayoutWorkerMessage = { type: 'progress', done, total };
      port.postMessage(message);
    });
    const message: LayoutWorkerMessage = { type: 'done', positions: extractPositions(graph) };
    port.postMessage(message);
  } catch (err) {
    const message: LayoutWorkerMessage = {
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
    port.postMessage(message);
  }
}

run();
