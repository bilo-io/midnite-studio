import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import type { ScriptContext, ScriptRun } from '@midnite/studio-shared';

import type { ScriptRunner } from './services';

/**
 * Phase 70 Theme B — the main-process broker for the sandboxed `pm.*`
 * runner (a factory since Phase 113 Theme O, so the feature never imports
 * `electron`: the composer hands over `spawn`, the one thing that forks a
 * process).
 *
 * **This is the departure from the phase doc, made explicitly by the user
 * requesting this theme.** The doc specifies the `vm` sandbox running in
 * Electron's main process; it runs here instead, inside a spawned
 * `utilityProcess` (`script-runner-worker.ts`) — its own OS process, its own
 * memory space, no Electron APIs, no main-process privileges. This module
 * is the thin broker the phase doc's own wording asks for: it owns the
 * child's lifecycle, forwards `{source, context, timeoutMs}` to it, and
 * receives a `ScriptRun` back. Everything that actually matters for
 * security — the allow-list, the `vm` context flags, `pm.expect` — lives in
 * `script-runner.ts`, imported unchanged by the worker; this file never
 * imports `node:vm` at all.
 *
 * Three things this broker owns that a naive "spawn once, postMessage
 * forever" version would not:
 *
 * - **A parent-side timeout, in addition to `vm`'s own.** `vm`'s `timeout`
 *   only interrupts *synchronous* code inside the context; it cannot save
 *   this process from a child that has wedged for some other reason (a
 *   native crash mid-write, a microtask storm the sandbox's own async-free
 *   allow-list should make impossible but that a bug could still produce).
 *   `run()` below races the child's reply against its own timer, set
 *   slightly past `timeoutMs` to give a well-behaved reply room to arrive
 *   first, and never awaits the child past that point.
 * - **Kill and respawn on timeout, not reuse.** A child is normally reused
 *   across runs (spawning a fresh process per script would be needless
 *   overhead for the common case), but the moment a run times out — at
 *   either layer — the child that produced it is presumed wedged and killed
 *   outright; the next `run()` call forks a new one rather than trusting a
 *   process that has already failed to answer once.
 * - **Kill on cancel and on quit.** A run carrying an `AbortSignal` (a
 *   collection run the user cancelled) kills the child the moment the signal
 *   aborts, so user code does not keep running until its own timeout; and
 *   `dispose()` — the composer's quit hook — kills it outright.
 */

const PARENT_GRACE_MS = 750;

/** The slice of a forked process the broker uses — Electron's `UtilityProcess` satisfies it. */
export type ScriptWorkerHandle = {
  postMessage: (message: unknown) => void;
  on(event: 'message', listener: (message: unknown) => void): void;
  on(event: 'exit', listener: (code: number) => void): void;
  kill: () => unknown;
};

/** Where the worker bundle sits beside the composer's own bundle. */
export function scriptRunnerWorkerPath(dirname: string = __dirname): string {
  return join(dirname, 'script-runner-worker.js').replace('app.asar', 'app.asar.unpacked');
}

type PendingRun = {
  resolve: (run: ScriptRun) => void;
  timer: ReturnType<typeof setTimeout>;
};

function failedRun(error: string): ScriptRun {
  return { results: [], logs: [], mutations: { environment: {}, collectionVariables: {} }, error };
}

const timedOutRun = (timeoutMs: number): ScriptRun => failedRun(`Script timed out after ${timeoutMs} ms.`);
const CANCELLED = 'Script cancelled.';
const STOPPED = 'The script runner stopped before the script finished.';

export function createScriptRunnerBroker(options: { spawn: () => ScriptWorkerHandle }): ScriptRunner {
  let child: ScriptWorkerHandle | null = null;
  const pending = new Map<string, PendingRun>();

  /** Settle every still-pending run — the only sane outcome once the child that was going to answer them is gone. */
  function rejectAllPending(): void {
    for (const [, entry] of pending) {
      clearTimeout(entry.timer);
      entry.resolve(failedRun(STOPPED));
    }
    pending.clear();
  }

  function killChild(): void {
    const current = child;
    child = null;
    current?.kill();
  }

  function ensureChild(): ScriptWorkerHandle {
    if (child) return child;
    const next = options.spawn();

    next.on('message', (raw) => {
      const message = raw as { runId: string; run: ScriptRun };
      const entry = pending.get(message.runId);
      if (!entry) return; // already timed out at the parent layer — late reply, ignored
      pending.delete(message.runId);
      clearTimeout(entry.timer);
      entry.resolve(message.run);
    });

    next.on('exit', () => {
      if (child === next) child = null;
      rejectAllPending();
    });

    child = next;
    return next;
  }

  return {
    run(source: string, context: ScriptContext, timeoutMs: number, signal?: AbortSignal): Promise<ScriptRun> {
      if (signal?.aborted) return Promise.resolve(failedRun(CANCELLED));
      const proc = ensureChild();
      const runId = randomUUID();

      return new Promise<ScriptRun>((resolve) => {
        const onAbort = (): void => {
          const entry = pending.get(runId);
          if (!entry) return;
          pending.delete(runId);
          clearTimeout(entry.timer);
          // Cancelled: the child is killed with the run, not left to finish user code nobody awaits.
          killChild();
          entry.resolve(failedRun(CANCELLED));
        };

        const settle = (run: ScriptRun): void => {
          signal?.removeEventListener('abort', onAbort);
          resolve(run);
        };

        const timer = setTimeout(() => {
          pending.delete(runId);
          // The child that owns this run is presumed wedged — see the header —
          // so it is killed rather than left to answer late into a run nobody
          // is waiting for any more.
          killChild();
          settle(timedOutRun(timeoutMs));
        }, timeoutMs + PARENT_GRACE_MS);

        pending.set(runId, { resolve: settle, timer });
        signal?.addEventListener('abort', onAbort, { once: true });
        proc.postMessage({ runId, source, context, timeoutMs });
      });
    },

    /** Kills the child, if one is running — the composer's quit hook. Nothing here holds state worth flushing. */
    dispose(): void {
      rejectAllPending();
      killChild();
    },
  };
}
