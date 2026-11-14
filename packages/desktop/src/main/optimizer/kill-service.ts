import type {
  OptimizerVoidResult,
  ProcessInfo,
  ProcessTableResult,
} from '@midnite/studio-shared';
import { basename } from 'node:path';

import type { AgentDefinition } from '@midnite/studio-shared';
import { app, type ProcessMetric } from 'electron';

import {
  descendantsOf,
  isOurProcess,
  matchRunningAgent,
  readProcessRows,
  readProcessTable,
  type ProcessRow,
  type PsParse,
} from '../agent-process';
import { getBrowserTabOwners, getWebAppOwners } from '@midnite/studio-feature-browser/main';
import { probeDetailedMemory } from '@midnite/studio-feature-monitor/main';
import {
  activePtyPids,
  connectedBrokerSockets,
  getPtySessionOwners,
  getSharedBrokerLocation,
  listAgents,
  listSessionIds,
  liveBrokerSessions,
} from '../pty-service';
import { getWindowOwners } from '../window-manager';
import {
  commandName,
  mergeAppMetrics,
  propagateOwnerToDescendants,
} from './app-metrics';
import {
  classifyBrokers,
  EMPTY_INVENTORY,
  foreignSessionTree,
  readBrokerDir,
  stampLostProcesses,
  type BrokerInventory,
  type BrokerSessionRef,
} from './broker-inventory';

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
  /** The lost-process inventory; read from the broker dir and the live broker client when omitted. */
  inventory?: BrokerInventory;
  /** Broker ptys and the agent roster, for the `<repo> · <agent>` owner label. */
  brokerSessions?: readonly BrokerSessionRef[];
  agents?: readonly AgentDefinition[];
};

/**
 * The lost-process inventory over a fresh `ps` snapshot (Phase 148 Theme B). Empty — so nothing is
 * widened — when there is no broker (in-process ptys) or anything here fails: the inventory only ever
 * adds kill targets, so failing closed means the old rule, never a wider one.
 */
export async function readBrokerInventory(rows: readonly ProcessRow[]): Promise<BrokerInventory> {
  try {
    const location = getSharedBrokerLocation();
    if (!location) return EMPTY_INVENTORY;
    const { pidFiles, socketNames } = readBrokerDir(location.directory);
    let sessionRows: Set<string> | null = null;
    try {
      sessionRows = new Set(await listSessionIds());
    } catch {
      sessionRows = null;
    }
    return classifyBrokers({
      brokerDir: location.directory,
      primarySocket: location.socketPath,
      pidFiles,
      socketNames,
      rows,
      connectedPeers: connectedBrokerSockets(),
      sessionRows,
      brokerSessions: liveBrokerSessions(),
    });
  } catch {
    return EMPTY_INVENTORY;
  }
}

/**
 * `"<repo> · <agent>"` for every broker pty an agent is running in, keyed by each pid in its tree.
 * `<repo>` is the basename of the session's spawn cwd — the broker knows nothing finer.
 */
export function agentOwnerLabels(
  rows: readonly ProcessRow[],
  sessions: readonly BrokerSessionRef[],
  agents: readonly AgentDefinition[],
): Map<number, string> {
  const labels = new Map<number, string>();
  for (const session of sessions) {
    const agentId = matchRunningAgent(rows, session.pid, agents);
    const agent = agentId === null ? undefined : agents.find((a) => a.id === agentId);
    if (!agent) continue;
    const label = `${basename(session.cwd) || session.cwd} · ${agent.label}`;
    for (const pid of [session.pid, ...descendantsOf(rows, session.pid).map((d) => d.row.pid)]) {
      labels.set(pid, label);
    }
  }
  return labels;
}

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
    for (const [pid, label] of getWebAppOwners()) {
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

  const inventory = opts.inventory ?? (await readBrokerInventory(rows));
  stampLostProcesses(processes, rows, inventory, descendantsOf);

  let agents: readonly AgentDefinition[] = opts.agents ?? [];
  if (!opts.agents) {
    try {
      agents = await listAgents();
    } catch {
      agents = [];
    }
  }
  const agentLabels = agentOwnerLabels(rows, opts.brokerSessions ?? liveBrokerSessions(), agents);
  for (const proc of processes) {
    const label = agentLabels.get(proc.pid);
    if (label) proc.owner = label;
  }

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
  /** The lost-process inventory; read fresh against the same `ps` snapshot when omitted. */
  inventory?: BrokerInventory;
};

const PROTECTED = 'This process is protected and cannot be terminated.';
const PRIMARY_BROKER = 'The current terminal broker is protected and cannot be terminated.';
const FOREIGN_SESSION = 'This session belongs to another app and cannot be terminated here.';
const PID_REUSE = 'Process PID reuse detected: the command line has changed since it was displayed.';

function sendSignal(
  pid: number,
  signal: NodeJS.Signals,
  signalProcess: (pid: number, signal: NodeJS.Signals) => void,
): OptimizerVoidResult {
  try {
    signalProcess(pid, signal);
    return { ok: true };
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    // Already gone is the outcome that was asked for.
    if (code === 'ESRCH') return { ok: true };
    if (code === 'EPERM') return { ok: false, message: 'Permission denied terminating process.' };
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

async function inventoryFor(rows: readonly ProcessRow[], options?: KillOptions): Promise<BrokerInventory> {
  return options?.inventory ?? (await readBrokerInventory(rows));
}

/**
 * End a lost terminal broker and everything it runs (Phase 148 Theme B).
 *
 * Only a broker the inventory lists and that is **not** the current primary qualifies, and only when
 * no session in it belongs to another app. SIGTERM goes to the broker alone: its shutdown flushes
 * scrollback and closes every pty master, which hangs up the sessions inside. `force` (the second,
 * explicit confirm) SIGKILLs the whole tree, deepest first, every pid re-read from the same fresh
 * snapshot the guards ran against.
 */
export async function killTree(
  brokerPid: number,
  expectArgv: string,
  force?: boolean,
  options?: KillOptions,
): Promise<OptimizerVoidResult> {
  const midnitePid = options?.midnitePid ?? process.pid;
  if (brokerPid <= 1 || brokerPid === midnitePid) return { ok: false, message: PROTECTED };

  const rows = options?.mockRows ?? (await readProcessRows());
  if (!rows) return { ok: false, message: 'Could not read process table.' };
  const target = rows.find((r) => r.pid === brokerPid);
  if (!target) return { ok: false, message: 'Process no longer exists.' };

  const inventory = await inventoryFor(rows, options);
  if (brokerPid === inventory.primaryPid) return { ok: false, message: PRIMARY_BROKER };
  const broker = inventory.brokers.find((b) => b.pid === brokerPid);
  if (!broker || broker.primary) {
    return { ok: false, message: 'Only a terminal broker from this app, other than the current one, can be ended.' };
  }
  if (target.args.trim() !== expectArgv.trim()) return { ok: false, message: PID_REUSE };

  const tree = descendantsOf(rows, brokerPid);
  const foreign = foreignSessionTree(rows, inventory, descendantsOf);
  if (tree.some((d) => foreign.has(d.row.pid))) {
    return { ok: false, message: 'This broker runs a session another app owns, so it is not ended from here.' };
  }

  const signalProcess = options?.signalFn ?? process.kill;
  if (!force) return sendSignal(brokerPid, 'SIGTERM', signalProcess);

  const deepestFirst = [...tree].sort((a, b) => b.depth - a.depth);
  for (const { row } of deepestFirst) {
    if (row.pid === midnitePid || row.pid === inventory.primaryPid) continue;
    sendSignal(row.pid, 'SIGKILL', signalProcess);
  }
  return sendSignal(brokerPid, 'SIGKILL', signalProcess);
}

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
    return { ok: false, message: PROTECTED };
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

  // 4. The current primary broker, and any session another app owns (Phase 148 Theme B)
  const inventory = await inventoryFor(rows, options);
  if (pid === inventory.primaryPid) {
    return { ok: false, message: PRIMARY_BROKER };
  }
  if (foreignSessionTree(rows, inventory, descendantsOf).has(pid)) {
    return { ok: false, message: FOREIGN_SESSION };
  }
  // A lost broker is ended as a tree, through the same guards plus its own.
  if (inventory.brokers.some((b) => b.pid === pid && !b.primary)) {
    return killTree(pid, expectArgv, force, { ...options, mockRows: rows, inventory, midnitePid });
  }

  // 5. Ownership validation (Decision 1: strictly Midnite-owned processes)
  const ptyPids = options?.ptyPids ?? activePtyPids();
  const brokerRoots = inventory.brokers.filter((b) => !b.primary).map((b) => b.pid);
  const ours = isOurProcess(pid, rows, ptyPids, midnitePid, brokerRoots);
  if (!ours) {
    return { ok: false, message: 'Only Midnite-spawned processes can be terminated.' };
  }

  // 6. PID reuse guard: verify argv matches the expected command line
  if (target.args.trim() !== expectArgv.trim()) {
    return { ok: false, message: PID_REUSE };
  }

  // 7. Signal execution (SIGTERM or SIGKILL)
  return sendSignal(pid, force ? 'SIGKILL' : 'SIGTERM', options?.signalFn ?? process.kill);
}
