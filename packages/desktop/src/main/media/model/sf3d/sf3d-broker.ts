import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import type { Sf3dGenerateStage } from '@midnite/studio-shared';

import type { Sf3dWorkerIn, Sf3dWorkerOut } from './worker-protocol';

/**
 * Main-side broker for `sf3d-worker` — the `music-broker.ts` shape: fork lazily, one child, replies
 * correlated by id, everything outstanding settled when the child exits so no caller hangs.
 *
 * One difference: **a cancel kills the child.** An ONNX `run` over the backbone takes seconds and
 * cannot be interrupted from inside, so the only cancel that lands at once is the process ending;
 * the next generation forks a fresh worker and reloads the sessions. `electron` is reached through
 * the injected `spawn`, so this file stays testable under bare vitest.
 */
export type Sf3dWorkerHandle = {
  postMessage: (message: unknown) => void;
  on(event: 'message', listener: (message: unknown) => void): void;
  on(event: 'exit', listener: (code: number) => void): void;
  kill: () => void;
};

export function sf3dWorkerScriptPath(dirname: string = __dirname): string {
  return join(dirname, 'sf3d-worker.js');
}

export type Sf3dRunRequest = { assetsDir: string; rgb: Float32Array; textureSize: number; name: string };
export type Sf3dRunResult = Extract<Sf3dWorkerOut, { type: 'reply'; ok: true }>;

const CRASHED = 'The SF3D engine stopped unexpectedly (it may have run out of memory). Try again; if it keeps happening, reinstall SF3D.';

export function createSf3dBroker(options: { spawn: () => Sf3dWorkerHandle }) {
  let child: Sf3dWorkerHandle | null = null;
  const pending = new Map<string, { onMessage: (m: Sf3dWorkerOut) => void; onExit: () => void }>();
  let lane: Promise<unknown> = Promise.resolve();

  function ensureChild(): Sf3dWorkerHandle {
    if (child) return child;
    const next = options.spawn();
    next.on('message', (raw) => {
      const message = raw as Sf3dWorkerOut;
      pending.get(message.id)?.onMessage(message);
    });
    next.on('exit', () => {
      if (child === next) child = null;
      for (const entry of [...pending.values()]) entry.onExit();
      pending.clear();
    });
    child = next;
    return next;
  }

  function runOnce(req: Sf3dRunRequest, opts: { signal: AbortSignal; onStage: (stage: Sf3dGenerateStage, fraction?: number) => void }): Promise<Sf3dRunResult> {
    return new Promise<Sf3dRunResult>((resolve, reject) => {
      if (opts.signal.aborted) return reject(new Error('cancelled'));
      const id = randomUUID();
      const worker = ensureChild();
      const onAbort = () => {
        pending.delete(id);
        reject(new Error('cancelled'));
        kill();
      };
      opts.signal.addEventListener('abort', onAbort, { once: true });
      const done = () => opts.signal.removeEventListener('abort', onAbort);
      pending.set(id, {
        onMessage: (m) => {
          if (m.type === 'stage') return opts.onStage(m.stage, m.fraction);
          pending.delete(id);
          done();
          if (m.ok) resolve(m);
          else reject(new Error(m.message));
        },
        onExit: () => {
          done();
          reject(new Error(opts.signal.aborted ? 'cancelled' : CRASHED));
        },
      });
      worker.postMessage({ type: 'generate', id, ...req } satisfies Sf3dWorkerIn);
    });
  }

  /** Generations are serialised: one set of ONNX sessions, one run at a time. */
  function run(req: Sf3dRunRequest, opts: { signal: AbortSignal; onStage: (stage: Sf3dGenerateStage, fraction?: number) => void }): Promise<Sf3dRunResult> {
    const next = lane.then(() => runOnce(req, opts));
    lane = next.catch(() => undefined);
    return next;
  }

  function kill(): void {
    const current = child;
    child = null;
    current?.kill();
  }

  /** Ends the worker (and with it the loaded sessions); outstanding runs fail. */
  function dispose(): void {
    const current = child;
    child = null;
    for (const entry of [...pending.values()]) entry.onExit();
    pending.clear();
    current?.kill();
  }

  return { run, dispose };
}

export type Sf3dBroker = ReturnType<typeof createSf3dBroker>;
