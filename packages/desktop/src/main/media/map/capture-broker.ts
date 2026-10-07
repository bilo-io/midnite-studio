import { join } from 'node:path';

import { MAP_CAPTURE_CANCELLED, MAP_CAPTURE_WORKER_CRASHED } from '@midnite/studio-shared';

import type { CaptureStats, CaptureWorkerIn, CaptureWorkerOut } from './capture-protocol';

/**
 * Main-side broker for `map-capture-worker` — the `terrain-broker.ts` shape. One child, forked on
 * first use; a capture is `begin` → `tile`* → `finish`, one at a time (the service refuses a second).
 * Cancel kills the child (the resample loop is synchronous), and the next capture forks a fresh one.
 * `electron` is reached through the injected `spawn`, so this stays testable under bare vitest.
 */
export type CaptureWorkerHandle = {
  postMessage: (message: unknown) => void;
  on(event: 'message', listener: (message: unknown) => void): void;
  on(event: 'exit', listener: (code: number) => void): void;
  kill: () => void;
};

export function mapCaptureWorkerScriptPath(dirname: string = __dirname): string {
  return join(dirname, 'map-capture-worker.js');
}

export type CaptureRunResult =
  | { ok: true; stats: CaptureStats }
  | { ok: false; message: string; cancelled?: true };

export function createCaptureBroker(options: { spawn: () => CaptureWorkerHandle }) {
  let child: CaptureWorkerHandle | null = null;
  let active: {
    id: string;
    child: CaptureWorkerHandle;
    onProgress: (fraction: number) => void;
    settle: (result: CaptureRunResult) => void;
  } | null = null;

  function ensureChild(): CaptureWorkerHandle {
    if (child) return child;
    const next = options.spawn();
    next.on('message', (raw) => {
      const message = raw as CaptureWorkerOut;
      if (!active || active.id !== message.id || active.child !== next) return;
      if (message.type === 'progress') return active.onProgress(message.fraction);
      active.settle(message.ok ? { ok: true, stats: message.stats } : { ok: false, message: message.message });
    });
    next.on('exit', () => {
      if (child === next) child = null;
      if (active?.child === next) active.settle({ ok: false, message: MAP_CAPTURE_WORKER_CRASHED });
    });
    child = next;
    return next;
  }

  function begin(
    start: Omit<Extract<CaptureWorkerIn, { type: 'begin' }>, 'type'>,
    onProgress: (fraction: number) => void = () => undefined,
  ) {
    const worker = ensureChild();
    let resolveDone!: (result: CaptureRunResult) => void;
    const done = new Promise<CaptureRunResult>((resolve) => {
      resolveDone = resolve;
    });
    const entry = {
      id: start.id,
      child: worker,
      onProgress,
      settle: (result: CaptureRunResult) => {
        if (active !== entry) return;
        active = null;
        resolveDone(result);
      },
    };
    active = entry;
    worker.postMessage({ type: 'begin', ...start } satisfies CaptureWorkerIn);
    return {
      addTile(x: number, y: number, width: number, height: number, rgba: Uint8Array): void {
        if (active === entry) worker.postMessage({ type: 'tile', id: start.id, x, y, width, height, rgba } satisfies CaptureWorkerIn);
      },
      /** Tells the worker every tile has been sent; the promise resolves with the encode result. */
      finish(): Promise<CaptureRunResult> {
        if (active === entry) worker.postMessage({ type: 'finish', id: start.id } satisfies CaptureWorkerIn);
        return done;
      },
      cancel(): void {
        if (active !== entry) return;
        entry.settle({ ok: false, message: MAP_CAPTURE_CANCELLED, cancelled: true });
        const current = child;
        child = null;
        current?.kill();
      },
    };
  }

  return {
    begin,
    dispose(): void {
      active?.settle({ ok: false, message: MAP_CAPTURE_WORKER_CRASHED });
      const current = child;
      child = null;
      current?.kill();
    },
  };
}

export type CaptureBroker = ReturnType<typeof createCaptureBroker>;
