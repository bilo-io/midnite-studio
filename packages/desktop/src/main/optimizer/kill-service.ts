import { basename } from 'node:path';

import type {
  OptimizerVoidResult,
  ProcessInfo,
  ProcessTableResult,
} from '@midnite/studio-shared';

import { isOurProcess, readProcessRows, type ProcessRow } from '../agent-process';
import { probeDetailedMemory } from '../metrics/memory';
import { activePtyPids } from '../pty-service';

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

function commandName(args: string): string {
  const token = args.trim().split(/\s+/)[0] ?? '';
  return basename(token);
}

/**
 * Reads the machine's process table, identifies Midnite-owned processes,
 * and fetches the detailed physical memory breakdown.
 */
export async function getProcessTableResult(
  mockRows?: ProcessRow[],
): Promise<ProcessTableResult> {
  const rows = mockRows ?? (await readProcessRows()) ?? [];
  const ptyPids = activePtyPids();

  const processes: ProcessInfo[] = rows.map((row) => ({
    pid: row.pid,
    ppid: row.ppid,
    name: commandName(row.args),
    argv: row.args,
    rssBytes: row.rssBytes,
    cpuPercent: row.cpuPercent,
    ours: isOurProcess(row.pid, rows, ptyPids),
  }));

  // Default sort: highest resident memory first
  processes.sort((a, b) => b.rssBytes - a.rssBytes);

  const memory = (await probeDetailedMemory()) ?? null;

  return { processes, memory };
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
