import { randomUUID } from 'node:crypto';

import { EVENT_CHANNELS, type LoopModel, type LoopRunRecord } from '@midnite/studio-shared';
import type { BrowserWindow } from 'electron';

import { MAX_STORED_LOOP_RUNS, nullLoopRunsStore, type LoopRunsStore } from './loop-runs-store';

/**
 * The loop-run ledger (Phase 35).
 *
 * The renderer announces a Start (it owns session creation); this module owns
 * every END. A natural exit is finalised off the pty's own exit — wired from
 * `pty-service.ts`'s `onSessionExit` — so a renderer that reloads, or a window
 * that closes, mid-run cannot lose the record's `endedAt`/`exitCode`. A run
 * still `running` when the store loads belongs to a process that died with the
 * last quit, and is finalised `stopped` on load — the same honest posture the
 * broker takes with a dead session.
 *
 * State is one in-memory array + one JSON file, serialised through a single
 * mutation queue (`withLock`) the way `council-runner.ts` learned to: two
 * finalisations racing (a Stop and the exit it causes) must not clobber each
 * other's write.
 */

let store: LoopRunsStore = nullLoopRunsStore;
let getWindowThunk: () => BrowserWindow | null = () => null;
let runs: LoopRunRecord[] = [];
let loaded: Promise<void> | null = null;
let lock: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = lock.then(fn, fn);
  lock = next.catch(() => undefined);
  return next;
}

function emitChanged(): void {
  const win = getWindowThunk();
  if (win && !win.isDestroyed()) {
    win.webContents.send(EVENT_CHANNELS.loopRunsChanged);
  }
}

export function configureLoopRuns(
  nextStore: LoopRunsStore,
  getWindow: () => BrowserWindow | null,
): void {
  store = nextStore;
  getWindowThunk = getWindow;
  loaded = null;
}

async function ensureLoaded(): Promise<void> {
  loaded ??= (async () => {
    const restored = await store.load();
    // A run this file says is `running` outlived nothing: its pty died with
    // the app that spawned it. Finalise rather than pretend.
    let dangling = false;
    runs = restored.map((run) => {
      if (run.status !== 'running') return run;
      dangling = true;
      return { ...run, status: 'stopped' as const };
    });
    if (dangling) await store.save(runs);
  })();
  await loaded;
}

export async function listLoopRuns(): Promise<LoopRunRecord[]> {
  await ensureLoaded();
  return [...runs];
}

export async function startLoopRun(req: {
  loopId: string;
  sessionId: string;
  composedPrompt: string;
  checkedModifierIds: string[];
  model?: LoopModel | undefined;
}): Promise<LoopRunRecord> {
  return withLock(async () => {
    await ensureLoaded();
    const record: LoopRunRecord = {
      id: randomUUID(),
      loopId: req.loopId,
      sessionId: req.sessionId,
      startedAt: Date.now(),
      composedPrompt: req.composedPrompt,
      checkedModifierIds: req.checkedModifierIds,
      // Spread rather than `model: req.model`: the record is parsed by an
      // `.optional()` field, and an explicit `undefined` key would survive the
      // JSON round-trip as a present-but-empty property in the ledger file.
      ...(req.model === undefined ? {} : { model: req.model }),
      status: 'running',
    };
    /*
      Capped here, at write time — not left to `store.save`'s own trim, which
      only ever bounded the copy written to disk (Phase 45 Theme D: the
      identical bug `council-service.ts`'s `saveRun` had, same shape, same
      fix). Capping on every push stays correct even if the store's own
      trimming rule ever changes independently of this file.
    */
    const next = [...runs, record];
    runs = next.length > MAX_STORED_LOOP_RUNS ? next.slice(next.length - MAX_STORED_LOOP_RUNS) : next;
    await store.save(runs);
    emitChanged();
    return record;
  });
}

/** Finalise the session's running record — a no-op when none is running. */
export async function stopLoopRun(sessionId: string): Promise<void> {
  await finalize(sessionId, { status: 'stopped' });
}

/**
 * Wired to `pty-service.ts`'s `onSessionExit`: fires for EVERY session's pty
 * exit, so the sessionId filter here (no running record → nothing to do) is
 * what keeps ordinary terminals out of the ledger.
 */
export function noteSessionExit(sessionId: string, exitCode: number): void {
  void finalize(sessionId, { status: 'exited', exitCode });
}

async function finalize(
  sessionId: string,
  end: { status: 'stopped' | 'exited'; exitCode?: number },
): Promise<void> {
  await withLock(async () => {
    await ensureLoaded();
    const index = runs.findIndex((run) => run.sessionId === sessionId && run.status === 'running');
    if (index === -1) return;
    const current = runs[index];
    if (!current) return;
    const next: LoopRunRecord = {
      ...current,
      status: end.status,
      endedAt: Date.now(),
      ...(end.exitCode === undefined ? {} : { exitCode: end.exitCode }),
    };
    runs = [...runs.slice(0, index), next, ...runs.slice(index + 1)];
    await store.save(runs);
    emitChanged();
  });
}
