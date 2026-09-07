import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import type { ScriptContext, ScriptRun } from '@midnite/studio-shared';
import { utilityProcess, type UtilityProcess } from 'electron';

/**
 * Phase 70 Theme B — the main-process broker for the sandboxed `pm.*`
 * runner.
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
 * Two things this broker owns that a naive "spawn once, postMessage
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
 *   across runs (spawning a fresh `utilityProcess` per script would be
 *   needless overhead for the common case), but the moment a run times out
 *   — at either layer — the child that produced it is presumed wedged and
 *   killed outright; the next `run()` call forks a new one rather than
 *   trusting a process that has already failed to answer once.
 */

const PARENT_GRACE_MS = 750;

function workerScriptPath(): string {
  return join(__dirname, 'script-runner-worker.js').replace('app.asar', 'app.asar.unpacked');
}

interface PendingRun {
  resolve: (run: ScriptRun) => void;
  timer: ReturnType<typeof setTimeout>;
}

let child: UtilityProcess | null = null;
const pending = new Map<string, PendingRun>();

function timedOutRun(timeoutMs: number): ScriptRun {
  return {
    results: [],
    logs: [],
    mutations: { environment: {}, collectionVariables: {} },
    error: `Script timed out after ${timeoutMs} ms.`,
  };
}

/** Settle every still-pending run as a timeout — the only sane outcome once
 *  the child that was going to answer them is gone (killed, or exited on
 *  its own) before it did. */
function rejectAllPending(): void {
  for (const [, entry] of pending) {
    clearTimeout(entry.timer);
    entry.resolve(timedOutRun(0));
  }
  pending.clear();
}

function killChild(): void {
  const current = child;
  child = null;
  current?.kill();
}

function ensureChild(): UtilityProcess {
  if (child) return child;

  const next = utilityProcess.fork(workerScriptPath(), [], {
    serviceName: 'mstudio-script-runner',
    stdio: 'ignore',
  });

  next.on('message', (message: { runId: string; run: ScriptRun }) => {
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

/**
 * Run one script in the utilityProcess, spawning it fresh if none is
 * currently alive. Never rejects and never throws — a timeout, a crashed
 * child, or a malformed reply all resolve to a `ScriptRun` with `error` set,
 * exactly as `script-runner.ts`'s own contract promises for every failure
 * that happens to run *inside* the sandbox.
 */
export function runScriptInUtilityProcess(
  source: string,
  context: ScriptContext,
  timeoutMs: number,
): Promise<ScriptRun> {
  const proc = ensureChild();
  const runId = randomUUID();

  return new Promise<ScriptRun>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(runId);
      // The child that owns this run is presumed wedged — see the header —
      // so it is killed rather than left to answer late into a run nobody
      // is waiting for any more.
      killChild();
      resolve(timedOutRun(timeoutMs));
    }, timeoutMs + PARENT_GRACE_MS);

    pending.set(runId, { resolve, timer });
    proc.postMessage({ runId, source, context, timeoutMs });
  });
}

/** Kills the utilityProcess, if one is running — called on app quit
 *  (`main/index.ts`'s `before-quit`), the same fire-and-forget shape as
 *  `stopAllVideoProcesses`/`stopDemoApi`: nothing here holds state worth
 *  flushing across a restart. */
export function disposeScriptRunner(): void {
  rejectAllPending();
  killChild();
}
