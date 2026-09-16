import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Worker } from 'node:worker_threads';

import type { LayoutPositions, LeanGraph } from '@midnite/studio-knowledge';

/**
 * Where the worker's compiled entry point lives.
 *
 * In packaged Electron (`scripts/bundle.mjs`), `knowledge-layout-worker` is
 * bundled directly into `dist/bundle/knowledge-layout-worker.js` alongside
 * `main.js` so it survives packaging (where `node_modules/@midnite/**` is
 * excluded from `app.asar`). In unbundled dev or unit test environments,
 * `join(dirnameOverride, 'knowledge-layout-worker.js')` might not exist yet,
 * so we fall back to resolving `layout-worker.js` from `@midnite/studio-knowledge`.
 */
export function resolveLayoutWorkerPath(dirnameOverride: string = __dirname): string {
  const bundled = join(dirnameOverride, 'knowledge-layout-worker.js');
  if (existsSync(bundled)) return bundled;

  try {
    const indexPath = require.resolve('@midnite/studio-knowledge');
    const unbundled = join(dirname(indexPath), 'layout-worker.js');
    if (existsSync(unbundled)) return unbundled;
  } catch {}

  return bundled;
}

export type LayoutRunResult =
  | { ok: true; positions: LayoutPositions }
  | { ok: false; message: string };

/**
 * Run a cold ForceAtlas2 pass off the main thread. `onProgress` is called for
 * every batch the worker reports — Theme D's progress bar while a multi-
 * second pass over 14,881 nodes runs; a cache hit never calls this function at
 * all.
 */
export function runLayoutInWorker(
  lean: LeanGraph,
  options: { totalIterations: number; batchSize: number },
  onProgress: (done: number, total: number) => void,
): Promise<LayoutRunResult> {
  return new Promise((resolve) => {
    let settled = false;
    const worker = new Worker(resolveLayoutWorkerPath(), {
      workerData: {
        lean,
        totalIterations: options.totalIterations,
        batchSize: options.batchSize,
      },
    });

    const finish = (result: LayoutRunResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
      // Best-effort — the worker has already posted its final message and has
      // no more work; a rejected terminate() here has nothing left to affect.
      worker.terminate().catch(() => {});
    };

    worker.on('message', (message: unknown) => {
      const msg = message as
        | { type: 'progress'; done: number; total: number }
        | { type: 'done'; positions: LayoutPositions }
        | { type: 'error'; message: string };
      if (msg.type === 'progress') {
        onProgress(msg.done, msg.total);
      } else if (msg.type === 'done') {
        finish({ ok: true, positions: msg.positions });
      } else if (msg.type === 'error') {
        finish({ ok: false, message: msg.message });
      }
    });

    worker.on('error', (err) => {
      finish({ ok: false, message: err instanceof Error ? err.message : String(err) });
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        finish({ ok: false, message: `Layout worker exited with code ${code}.` });
      }
    });
  });
}
