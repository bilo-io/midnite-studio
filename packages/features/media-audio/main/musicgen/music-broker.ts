import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { failure, ok, type GitOpResult } from '@midnite/studio-shared';

import type { MusicEngine, MusicRender, MusicRenderRequest } from './engine';
import type { InstallProgress, RuntimeStatus } from './runtime';
import type { MusicWorkerIn, MusicWorkerOut } from './worker-protocol';

/**
 * Main-side broker for the `music-worker` utility process, shaped after
 * `companion/tts-broker.ts`: fork lazily, keep one child, correlate replies by
 * id, and on any exit settle everything outstanding so no caller hangs. It is
 * also the `MusicEngine` the `musicgen` provider renders through.
 *
 * Renders are serialised here (one ONNX session, one render at a time) and a
 * cancel is a message to the worker, whose streamer throws on its next step.
 *
 * The fork target (the host's `spawn`) stays *inside* `app.asar` — see `workerScriptPath` in
 * `tts-broker.ts` for why unpacking it breaks `require('@huggingface/…')`.
 */
export type MusicWorkerHandle = {
  postMessage: (message: unknown) => void;
  on(event: 'message', listener: (message: unknown) => void): void;
  on(event: 'exit', listener: (code: number) => void): void;
  kill: () => void;
};

export function musicWorkerScriptPath(dirname: string = __dirname): string {
  return join(dirname, 'music-worker.js');
}

const CRASHED = 'The local music engine crashed. Try again; if it keeps happening, reinstall the model from Settings.';

type Pending = {
  onMessage: (message: MusicWorkerOut) => void;
  onExit: () => void;
};

/**
 * `spawn` forks the worker. It is the host's to provide — Studio forks an Electron `utilityProcess`
 * at `musicWorkerScriptPath()`; an app with no local engine passes {@link unavailableMusicWorker} —
 * so this module never imports `electron` (Phase 113 Theme Q).
 */
export function createMusicBroker(options: { spawn: () => MusicWorkerHandle }) {
  const { spawn } = options;

  let directory: string | null = null;
  let child: MusicWorkerHandle | null = null;
  const pending = new Map<string, Pending>();
  const installListeners = new Set<(p: InstallProgress) => void>();
  let renderLane: Promise<unknown> = Promise.resolve();

  function handleMessage(raw: unknown): void {
    const message = raw as MusicWorkerOut;
    if (message.type === 'install-progress') {
      for (const listener of installListeners) listener(message.progress);
      return;
    }
    pending.get(message.id)?.onMessage(message);
  }

  function handleExit(): void {
    child = null;
    for (const entry of [...pending.values()]) entry.onExit();
    pending.clear();
  }

  function ensureChild(): MusicWorkerHandle {
    if (child) return child;
    const next = spawn();
    next.on('message', handleMessage);
    next.on('exit', handleExit);
    if (directory !== null) next.postMessage({ type: 'configure', directory } satisfies MusicWorkerIn);
    child = next;
    return next;
  }

  const send = (message: MusicWorkerIn) => ensureChild().postMessage(message);

  function configure(userData: string): void {
    directory = userData;
  }

  function status(): Promise<RuntimeStatus> {
    const id = randomUUID();
    return new Promise((resolve) => {
      pending.set(id, {
        onMessage: (m) => {
          pending.delete(id);
          if (m.type === 'status-reply') resolve(m.value);
        },
        onExit: () => resolve({ state: 'unavailable', reason: CRASHED }),
      });
      send({ type: 'status', id });
    });
  }

  /** Download + load the model, streaming progress to `onProgress`. */
  function install(onProgress: (p: InstallProgress) => void): Promise<GitOpResult> {
    const id = randomUUID();
    installListeners.add(onProgress);
    return new Promise<GitOpResult>((resolve) => {
      pending.set(id, {
        onMessage: (m) => {
          if (m.type !== 'install-reply') return;
          pending.delete(id);
          resolve(m.ok ? ok(undefined) : failure(m.message ?? 'The model could not be installed.'));
        },
        onExit: () => resolve(failure(CRASHED)),
      });
      send({ type: 'install', id });
    }).finally(() => installListeners.delete(onProgress));
  }

  function renderOnce(
    req: MusicRenderRequest,
    opts: { signal: AbortSignal; onProgress: (fraction: number) => void },
  ): Promise<MusicRender> {
    return new Promise<MusicRender>((resolve, reject) => {
      if (opts.signal.aborted) return reject(new Error('cancelled'));
      const id = randomUUID();
      const onAbort = () => send({ type: 'cancel', id });
      opts.signal.addEventListener('abort', onAbort, { once: true });
      const done = () => opts.signal.removeEventListener('abort', onAbort);
      pending.set(id, {
        onMessage: (m) => {
          if (m.type === 'render-progress') return opts.onProgress(m.fraction);
          if (m.type !== 'render-reply') return;
          pending.delete(id);
          done();
          if (m.ok) resolve({ samples: m.samples, sampleRate: m.sampleRate });
          else reject(new Error(m.message));
        },
        onExit: () => {
          done();
          reject(new Error(CRASHED));
        },
      });
      send({ type: 'render', id, prompt: req.prompt, seconds: req.seconds });
    });
  }

  const engine: MusicEngine = {
    render(req, opts) {
      const run = renderLane.then(() => renderOnce(req, opts));
      renderLane = run.catch(() => undefined);
      return run;
    },
  };

  function dispose(): void {
    const current = child;
    child = null;
    for (const entry of [...pending.values()]) entry.onExit();
    pending.clear();
    current?.kill();
  }

  return { configure, status, install, engine, dispose };
}

export type MusicBroker = ReturnType<typeof createMusicBroker>;

/**
 * A worker handle for an app that bundles no local engine (Creator today):
 * every request is answered with "unavailable", so the Audio tab reports the
 * engine as not installable instead of hanging.
 */
export function unavailableMusicWorker(reason = 'The local music engine is not available in this app yet.'): MusicWorkerHandle {
  const listeners: { message: Array<(m: unknown) => void>; exit: Array<(code: number) => void> } = { message: [], exit: [] };
  const reply = (message: MusicWorkerOut) => queueMicrotask(() => listeners.message.forEach((l) => l(message)));
  return {
    postMessage(raw) {
      const message = raw as MusicWorkerIn;
      if (message.type === 'status') reply({ type: 'status-reply', id: message.id, value: { state: 'unavailable', reason } });
      else if (message.type === 'install') reply({ type: 'install-reply', id: message.id, ok: false, message: reason });
      else if (message.type === 'render') reply({ type: 'render-reply', id: message.id, ok: false, message: reason });
    },
    on(event: 'message' | 'exit', listener: ((m: unknown) => void) & ((code: number) => void)) {
      (listeners[event] as Array<typeof listener>).push(listener);
    },
    kill() {},
  };
}
