import type {
  OptimizerVoidResult,
  ProcessInfo,
  ProcessTableResult,
} from '@midnite/studio-shared';
import { app, type ProcessMetric } from 'electron';

import {
  isOurProcess,
  readProcessRows,
  readProcessTable,
  type ProcessRow,
  type PsParse,
} from '../agent-process';
import { getAppOwners } from '../apps-service';
import { getBrowserTabOwners } from '../browser-service';
import { probeDetailedMemory } from '../metrics/memory';
import { activePtyPids, getPtySessionOwners } from '../pty-service';
import { getWindowOwners } from '../window-manager';
import {
  commandName,
  mergeAppMetrics,
  propagateOwnerToDescendants,
} from './app-metrics';

/**
 * Process termination and process table provider (Phase 59 Theme D).
 *
 * ## Answering agent-process.ts:26-31
 *
 * `agent-process.ts` documents:
 * > "There is no kill, no restart and no auto-spawn here, deliberately: the probe
 * > exists so the UI can stop lying about what is running. A button that stops an
 * > agent is a write path and wants its own confirm story."
 *
 * This file is that confirm story. A button that stops a process is gated by:
 * 1. Strict ownership validation (`ours: true`) — only Midnite Studio's own
 *    processes and pty agent sessions can be killed (per Decision 1).
 * 2. An unbreakable self-preservation deny-list protecting Midnite Studio's
 *    own main process, its pty broker, and critical OS processes (launchd, WindowServer, loginwindow).
 * 3. A PID-reuse guard: `expectArgv` is re-validated against a fresh `ps` snapshot
 *    immediately before signaling, preventing termination if the PID was recycled.
 * 4. User confirmation with `danger: true`, showing the target command's full argv
 *    and PID in the warnings list.
 * 5. An escalation protocol: graceful `SIGTERM` by default, with an explicit `force`
 *    flag for user-driven `SIGKILL` if graceful shutdown fails.
 * 6. Never throws across IPC — all errors return discriminated `{ ok: false, message }` envelopes.
 */

const PROTECTED_PROCESS_NAMES = new Set([
  'launchd',
  'WindowServer',
  'loginwindow',
  'kernel_task',
  'systemstats',
  'fseventsd',
  'logd',
  'configd',
  'powerd',
]);

export type ProcessTableOptions = {
  mockMetrics?: ProcessMetric[];
  ptyPids?: readonly number[];
  owners?: ReadonlyMap<number, string | null>;
};

function collectActiveOwners(rows: readonly ProcessRow[]): Map<number, string> {
  const owners = new Map<number, string>();

  // 1. Windows (main window + detached popout windows)
  try {
    for (const [pid, label] of getWindowOwners()) {
      owners.set(pid, label);
    }
  } catch {
    // webContents or window map not ready / in test
  }

  // 2. Browser tabs
  try {
    for (const [pid, label] of getBrowserTabOwners()) {
      owners.set(pid, label);
    }
  } catch {
    // browser service not initialized / in test
  }

  // 3. Embedded apps
  try {
    for (const [pid, label] of getAppOwners()) {
      owners.set(pid, label);
    }
  } catch {
    // apps service not initialized / in test
  }

  // 4. PTY sessions
  try {
    const ptyOwners = getPtySessionOwners();
    for (const [pid, label] of ptyOwners) {
      owners.set(pid, label);
    }
    // Propagate pty session labels to child processes in the pty tree
    const propagated = propagateOwnerToDescendants(rows, ptyOwners);
    for (const [pid, label] of propagated) {
      if (!owners.has(pid)) {
        owners.set(pid, label);
      }
    }
  } catch {
    // pty service not initialized / in test
  }

  return owners;
}

/**
 * Reads the machine's process table, identifies Midnite-owned processes,
 * joins with Electron's `app.getAppMetrics()` and active registries,
 * and fetches the detailed physical memory breakdown.
 *
 * `error` (Phase 85 Theme B) distinguishes "nothing running" from "I do not
 * understand this machine's `ps`": a table with lines that all failed to
 * parse reads very differently from a genuinely empty one, and the renderer
 * has no other way to tell them apart.
 *
 * `mockParsed` accepts either a plain row array (the common case, and every
 * existing caller's shape — `totalLines` defaults to the row count, so
 * `error` comes out `null`) or a full {@link PsParse}, which is what a test
 * exercising the "every line failed to parse" branch needs: a plain array
 * can never express `totalLines > 0` alongside zero rows.
 */
export async function getProcessTableResult(
  mockParsed?: ProcessRow[] | PsParse,
  optionsOrMockMetrics?: ProcessMetric[] | ProcessTableOptions,
): Promise<ProcessTableResult> {
  const parsed = mockParsed
    ? Array.isArray(mockParsed)
      ? { rows: mockParsed, totalLines: mockParsed.length }
      : mockParsed
    : await readProcessTable();
  const rows = parsed?.rows ?? [];

  const opts: ProcessTableOptions = Array.isArray(optionsOrMockMetrics)
    ? { mockMetrics: optionsOrMockMetrics }
    : (optionsOrMockMetrics ?? {});

  const ptyPids = opts.ptyPids ?? activePtyPids();

  let metrics: ProcessMetric[] = [];
  if (opts.mockMetrics) {
    metrics = opts.mockMetrics;
  } else {
    try {
      metrics = typeof app?.getAppMetrics === 'function' ? app.getAppMetrics() : [];
    } catch {
      metrics = [];
    }
  }

  const owners = opts.owners ?? collectActiveOwners(rows);

  const processes: ProcessInfo[] = mergeAppMetrics(rows, metrics, {
    ptyPids,
    owners,
  });

  // Default sort: highest resident memory first
  processes.sort((a, b) => (b.rssBytes ?? 0) - (a.rssBytes ?? 0));

  const memory = (await probeDetailedMemory()) ?? null;

  const error =
    parsed === null
      ? 'Could not read the process table.'
      : parsed.totalLines > 0 && parsed.rows.length === 0
        ? `Could not parse the process table (${parsed.totalLines} lines, 0 rows).`
        : null;

  return { processes, memory, error };
}

export type KillOptions = {
  mockRows?: ProcessRow[];
  signalFn?: (pid: number, signal: NodeJS.Signals) => void;
  ptyPids?: number[];
  midnitePid?: number;
};

/**
 * Terminates a process, guarded by ownership, deny-list, and PID-reuse checks.
 */
export async function killProcess(
  pid: number,
  expectArgv: string,
  force?: boolean,
  options?: KillOptions,
): Promise<OptimizerVoidResult> {
  const midnitePid = options?.midnitePid ?? process.pid;

  // 1. Self-preservation deny-list (PID based)
  if (pid <= 0 || pid === 1 || pid === midnitePid) {
    return { ok: false, message: 'This process is protected and cannot be terminated.' };
  }

  // 2. Fresh read of process table for PID-reuse and ownership checks
  const rows = options?.mockRows ?? (await readProcessRows());
  if (!rows) {
    return { ok: false, message: 'Could not read process table.' };
  }

  const target = rows.find((r) => r.pid === pid);
  if (!target) {
    return { ok: false, message: 'Process no longer exists.' };
  }

  // 3. System process name deny-list
  const name = commandName(target.args);
  if (PROTECTED_PROCESS_NAMES.has(name)) {
    return { ok: false, message: `System process "${name}" is protected and cannot be terminated.` };
  }

  // 4. Ownership validation (Decision 1: strictly Midnite-owned processes)
  const ptyPids = options?.ptyPids ?? activePtyPids();
  const ours = isOurProcess(pid, rows, ptyPids, midnitePid);
  if (!ours) {
    return { ok: false, message: 'Only Midnite-spawned processes can be terminated.' };
  }

  // 5. PID reuse guard: verify argv matches the expected command line
  if (target.args.trim() !== expectArgv.trim()) {
    return {
      ok: false,
      message: 'Process PID reuse detected: the command line has changed since it was displayed.',
    };
  }

  // 6. Signal execution (SIGTERM or SIGKILL)
  const signal: NodeJS.Signals = force ? 'SIGKILL' : 'SIGTERM';
  const signalProcess = options?.signalFn ?? process.kill;

  try {
    signalProcess(pid, signal);
    return { ok: true };
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ESRCH') {
      // Process already terminated
      return { ok: true };
    }
    if (code === 'EPERM') {
      return { ok: false, message: 'Permission denied terminating process.' };
    }
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
