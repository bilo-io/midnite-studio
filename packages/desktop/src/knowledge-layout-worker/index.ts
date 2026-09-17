import { parentPort, workerData } from 'node:worker_threads';

import {
  DEFAULT_LAYOUT_ID,
  extractPositions,
  runLayout,
  toGraphologyGraph,
  type LayoutWorkerData,
  type LayoutWorkerMessage,
} from '@midnite/studio-knowledge';

/**
 * Phase 87 Theme B — the `worker_threads` entry point `layout-runner.ts`
 * spawns for cold layout passes. Dispatches on `layoutId` (Phase 89 Theme E)
 * via `runLayout` rather than always running ForceAtlas2.
 *
 * Re-exported through `@midnite/studio-knowledge`'s layout primitives so that
 * when `scripts/bundle.mjs` bundles this entry into
 * `dist/bundle/knowledge-layout-worker.js`, esbuild inlines the graphology and
 * layout code directly into a single self-contained CommonJS bundle for
 * packaged Electron (where `node_modules/@midnite/**` is excluded).
 */
function run(): void {
  if (!parentPort) {
    throw new Error('knowledge-layout-worker must be run inside a worker_threads Worker.');
  }
  const port = parentPort;
  const { lean, layoutId, totalIterations, batchSize } = workerData as LayoutWorkerData;

  try {
    const graph = toGraphologyGraph(lean);
    runLayout(graph, layoutId ?? DEFAULT_LAYOUT_ID, totalIterations, batchSize, (done, total) => {
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
