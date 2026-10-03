import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { failure, ok, type GitOpResult } from '@midnite/studio-shared';
import { utilityProcess } from 'electron';

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
 * The fork target stays *inside* `app.asar` — see `workerScriptPath` in
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

export function createMusicBroker(options: { spawn?: () => MusicWorkerHandle } = {}) {
  const spawn =
    options.spawn ??
    (() => utilityProcess.fork(musicWorkerScriptPath(), [], { serviceName: 'mstudio-music', stdio: 'ignore' }) as MusicWorkerHandle);

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
