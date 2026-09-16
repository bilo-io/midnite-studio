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
 * How long the worker may go without posting anything before it is declared
 * dead and terminated. Measured against this repo's own graph (15,199 nodes /
 * 36,772 links) in the packaged app: a 25-iteration batch takes 2-4 s, so a
 * minute of silence is not "slow", it is "never coming back". The clock is
 * reset on every progress message, so a genuinely large graph that keeps
 * reporting is never cut off — only one that has stopped talking.
 */
export const LAYOUT_STALL_MS = 60_000;

export type LayoutRunOptions = {
  totalIterations: number;
  batchSize: number;
  /** Silence budget before the run is abandoned — see {@link LAYOUT_STALL_MS}. */
  stallMs?: number;
  /** Test seam: the worker script to spawn, instead of {@link resolveLayoutWorkerPath}'s answer. */
  workerPath?: string;
};

/**
 * Run a cold ForceAtlas2 pass off the main thread. `onProgress` is called for
 * every batch the worker reports — Theme D's progress bar while a multi-
 * second pass runs; a cache hit never calls this function at all.
 *
 * Every way a `worker_threads` Worker can end is mapped onto a settled
 * promise, because the renderer's spinner is bound to this promise settling
 * and nothing else: a `done` or `error` message, an `error` event (the script
 * failed to load, or threw outside its own try), a non-zero exit, a **clean
 * exit that never posted `done`** (the one shape the original code left
 * unsettled — a spinner forever), and a worker that simply stops reporting
 * (the stall watchdog). The IPC handler above this turns each into a
 * `KnowledgeResult` the view renders as an error with a Retry, never a hang.
 */
export function runLayoutInWorker(
  lean: LeanGraph,
  options: LayoutRunOptions,
  onProgress: (done: number, total: number) => void,
): Promise<LayoutRunResult> {
  const stallMs = options.stallMs ?? LAYOUT_STALL_MS;
  return new Promise((resolve) => {
    let settled = false;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    let sawDone = false;

    let worker: Worker;
    try {
      worker = new Worker(options.workerPath ?? resolveLayoutWorkerPath(), {
        workerData: {
          lean,
          totalIterations: options.totalIterations,
          batchSize: options.batchSize,
        },
      });
    } catch (err) {
      resolve({
        ok: false,
        message: `Could not start the layout worker: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    const finish = (result: LayoutRunResult): void => {
      if (settled) return;
      settled = true;
      if (stallTimer) clearTimeout(stallTimer);
      resolve(result);
      // Best-effort — either the worker has already posted its final message
      // and has no more work, or it is the thing we are giving up on; a
      // rejected terminate() here has nothing left to affect.
      worker.terminate().catch(() => {});
    };

    const armStallTimer = (): void => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        finish({
          ok: false,
          message: `The layout worker reported no progress for ${Math.round(stallMs / 1000)}s and was stopped.`,
        });
      }, stallMs);
    };
    armStallTimer();

    worker.on('message', (message: unknown) => {
      const msg = message as
        | { type: 'progress'; done: number; total: number }
        | { type: 'done'; positions: LayoutPositions }
        | { type: 'error'; message: string };
      if (msg.type === 'progress') {
        armStallTimer();
        onProgress(msg.done, msg.total);
      } else if (msg.type === 'done') {
        sawDone = true;
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
      } else if (!sawDone) {
        // A clean exit is only "success" if the layout actually arrived.
        finish({ ok: false, message: 'Layout worker exited without producing a layout.' });
      }
    });
  });
}
