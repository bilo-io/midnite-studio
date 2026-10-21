import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import {
  TERRAIN_BUILD_CANCELLED,
  TERRAIN_WORKER_CRASHED,
  type TerrainBuildStage,
  type TerrainSpec,
  type TerrainStats,
} from '@midnite/studio-shared';

import type { TerrainWorkerIn, TerrainWorkerOut } from './worker-protocol';

/**
 * Main-side broker for `terrain-worker` — the `sf3d-broker.ts` shape: fork lazily, one child, replies
 * correlated by id, and everything outstanding settled when the child exits so no caller hangs.
 *
 * - **Latest wins.** A build for a `key` (one terrain) that is already queued or running cancels it.
 * - **One lane.** Builds of different terrains queue behind each other, so two 4097² builds never
 *   hold two copies of the arrays.
 * - **Cancel kills the child.** The kernel loops are synchronous and cannot poll a flag, so the only
 *   cancel that lands at once is the process ending; the next build forks a fresh worker.
 *
 * `electron` is reached through the injected `spawn`, so this file stays testable under bare vitest.
 */
export type TerrainWorkerHandle = {
  postMessage: (message: unknown) => void;
  on(event: 'message', listener: (message: unknown) => void): void;
  on(event: 'exit', listener: (code: number) => void): void;
  kill: () => void;
};

export function terrainWorkerScriptPath(dirname: string = __dirname): string {
  return join(dirname, 'terrain-worker.js');
}

export type TerrainRunRequest = {
  /** One terrain — builds sharing a key supersede each other. */
  key: string;
  dir: string;
  outDir: string;
  spec: TerrainSpec;
  stages: TerrainBuildStage[];
  /** The caller's own id (so a cancel can name it before the first progress event); generated when absent. */
  buildId?: string;
};

export type TerrainRunResult = { ok: true; stats: TerrainStats } | { ok: false; message: string; cancelled?: true };

type Entry = {
  id: string;
  key: string;
  request: TerrainRunRequest;
  state: 'queued' | 'running' | 'settled';
  child: TerrainWorkerHandle | null;
  onProgress: (stage: TerrainBuildStage, fraction: number) => void;
  settle: (result: TerrainRunResult) => void;
};

export function createTerrainBroker(options: { spawn: () => TerrainWorkerHandle }) {
  let child: TerrainWorkerHandle | null = null;
  const entries = new Map<string, Entry>();
  let lane: Promise<unknown> = Promise.resolve();

  function ensureChild(): TerrainWorkerHandle {
    if (child) return child;
    const next = options.spawn();
    next.on('message', (raw) => {
      const message = raw as TerrainWorkerOut;
      const entry = entries.get(message.id);
      if (!entry || entry.child !== next) return;
      if (message.type === 'progress') return entry.onProgress(message.stage, message.fraction);
      entry.settle(message.ok ? { ok: true, stats: message.stats } : { ok: false, message: message.message });
    });
    next.on('exit', () => {
      if (child === next) child = null;
      // Only builds that were running on *this* child: a successor may already be on a new one.
      for (const entry of [...entries.values()]) {
        if (entry.child === next) entry.settle({ ok: false, message: TERRAIN_WORKER_CRASHED });
      }
    });
    child = next;
    return next;
  }

  function killChild(): void {
    const current = child;
    child = null;
    current?.kill();
  }

  function cancelEntry(entry: Entry): void {
    if (entry.state === 'settled') return;
    const wasRunning = entry.state === 'running';
    entry.settle({ ok: false, message: TERRAIN_BUILD_CANCELLED, cancelled: true });
    if (wasRunning) killChild();
  }

  /**
   * Starts a build. `done` resolves with the result and never rejects; `cancel()` ends it with
   * `Build cancelled.`. A second build for the same `key` cancels this one first.
   */
  function build(request: TerrainRunRequest, onProgress: (stage: TerrainBuildStage, fraction: number) => void = () => undefined) {
    for (const earlier of [...entries.values()]) if (earlier.key === request.key) cancelEntry(earlier);
    const id = request.buildId ?? randomUUID();
    let resolveDone!: (result: TerrainRunResult) => void;
    const done = new Promise<TerrainRunResult>((resolve) => {
      resolveDone = resolve;
    });
    const entry: Entry = {
      id,
      key: request.key,
      request,
      state: 'queued',
      child: null,
      onProgress,
      settle: (result) => {
        if (entry.state === 'settled') return;
        entry.state = 'settled';
        entries.delete(id);
        resolveDone(result);
      },
    };
    entries.set(id, entry);
    lane = lane.then(() => run(entry, done));
    return { buildId: id, done, cancel: () => cancelEntry(entry) };
  }

  /** Occupies the lane until `entry` settles. */
  async function run(entry: Entry, done: Promise<TerrainRunResult>): Promise<void> {
    if (entry.state === 'settled') return;
    const worker = ensureChild();
    entry.child = worker;
    entry.state = 'running';
    worker.postMessage({
      type: 'build',
      id: entry.id,
      dir: entry.request.dir,
      spec: entry.request.spec,
      outDir: entry.request.outDir,
      stages: entry.request.stages,
    } satisfies TerrainWorkerIn);
    await done;
  }

  /** Cancels a build by the id it was started with; `false` when it is not queued or running. */
  function cancel(buildId: string): boolean {
    const entry = entries.get(buildId);
    if (!entry) return false;
    cancelEntry(entry);
    return true;
  }

  /** Ends the worker; every outstanding build fails. */
  function dispose(): void {
    const current = child;
    child = null;
    for (const entry of [...entries.values()]) entry.settle({ ok: false, message: TERRAIN_WORKER_CRASHED });
    current?.kill();
  }

  return { build, cancel, dispose };
}

export type TerrainBroker = ReturnType<typeof createTerrainBroker>;
