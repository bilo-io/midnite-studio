import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import type { SfxGenerateStage } from '@midnite/studio-shared';

import type { SfxTake } from './pipeline';
import type { SfxWorkerIn, SfxWorkerOut } from './worker-protocol';

/**
 * Main-side broker for `sfx-worker` — SF3D's broker shape: fork lazily, one child, replies correlated by id,
 * everything outstanding settled when the child exits so no caller hangs, and **a cancel kills the child** (an
 * ONNX `run` cannot be interrupted from inside; the next take forks a fresh worker).
 *
 * Two additions, both because the three graphs hold ~3 GB resident: **an idle worker is ended** `idleMs` after
 * its last reply (the next take pays a couple of seconds to reload), and **a worker that answered an error is
 * ended** (a failed run's native memory is freed only by GC). `electron` is reached through the injected
 * `spawn`, so this file stays testable under bare vitest.
 */
export type SfxWorkerHandle = {
  postMessage: (message: unknown) => void;
  on(event: 'message', listener: (message: unknown) => void): void;
  on(event: 'exit', listener: (code: number) => void): void;
  kill: () => void;
};

export function sfxWorkerScriptPath(dirname: string = __dirname): string {
  return join(dirname, 'sfx-worker.js');
}

export type SfxRunRequest = { assetsDir: string; take: SfxTake };
export type SfxRunResult = { channels: Float32Array[]; sampleRate: number };
export type SfxRunOptions = { signal: AbortSignal; onStage: (stage: SfxGenerateStage, fraction?: number) => void };

const CRASHED = 'The sound-effect engine stopped unexpectedly (it may have run out of memory). Try again; if it keeps happening, reinstall Stable Audio Open Small.';
/** Five minutes: long enough for a session of re-rolls, short enough to hand the memory back. */
export const SFX_IDLE_MS = 5 * 60_000;

export function createSfxBroker(options: { spawn: () => SfxWorkerHandle; idleMs?: number; setTimer?: typeof setTimeout; clearTimer?: typeof clearTimeout }) {
  const idleMs = options.idleMs ?? SFX_IDLE_MS;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  let child: SfxWorkerHandle | null = null;
  /** Each entry remembers the child it was posted to: a killed child's exit arrives later, after a queued take may already run on its successor. */
  const pending = new Map<string, { worker: SfxWorkerHandle; onMessage: (m: SfxWorkerOut) => void; onExit: () => void }>();
  let lane: Promise<unknown> = Promise.resolve();
  let idle: ReturnType<typeof setTimeout> | null = null;

  const stopIdle = () => {
    if (idle) clearTimer(idle);
    idle = null;
  };
  const armIdle = () => {
    stopIdle();
    if (!child || pending.size > 0) return;
    idle = setTimer(() => {
      idle = null;
      if (pending.size === 0) kill();
    }, idleMs);
    (idle as { unref?: () => void }).unref?.();
  };

  function ensureChild(): SfxWorkerHandle {
    if (child) return child;
    const next = options.spawn();
    next.on('message', (raw) => {
      const message = raw as SfxWorkerOut;
      pending.get(message.id)?.onMessage(message);
    });
    next.on('exit', () => {
      if (child === next) child = null;
      for (const [id, entry] of [...pending]) {
        if (entry.worker !== next) continue;
        pending.delete(id);
        entry.onExit();
      }
    });
    child = next;
    return next;
  }

  function runOnce(req: SfxRunRequest, opts: SfxRunOptions): Promise<SfxRunResult> {
    return new Promise<SfxRunResult>((resolve, reject) => {
      if (opts.signal.aborted) return reject(new Error('cancelled'));
      stopIdle();
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
        worker,
        onMessage: (m) => {
          if (m.type === 'stage') return opts.onStage(m.stage, m.fraction);
          pending.delete(id);
          done();
          if (m.ok) {
            armIdle();
            resolve({ channels: m.channels, sampleRate: m.sampleRate });
          } else {
            // A failed run can leave ~3 GB of native session memory that only GC would free: end the child, and
            // the next take forks a clean one.
            kill();
            reject(new Error(m.message));
          }
        },
        onExit: () => {
          done();
          reject(new Error(opts.signal.aborted ? 'cancelled' : CRASHED));
        },
      });
      worker.postMessage({ type: 'generate', id, ...req } satisfies SfxWorkerIn);
    });
  }

  /** Takes are serialised: one set of ONNX sessions, one run at a time. */
  function run(req: SfxRunRequest, opts: SfxRunOptions): Promise<SfxRunResult> {
    const next = lane.then(() => runOnce(req, opts));
    lane = next.catch(() => undefined);
    return next;
  }

  function kill(): void {
    stopIdle();
    const current = child;
    child = null;
    current?.kill();
  }

  /** Ends the worker (and with it the loaded sessions); outstanding runs fail. */
  function dispose(): void {
    stopIdle();
    const current = child;
    child = null;
    for (const entry of [...pending.values()]) entry.onExit();
    pending.clear();
    current?.kill();
  }

  return { run, dispose, running: () => child !== null };
}

export type SfxBroker = ReturnType<typeof createSfxBroker>;
