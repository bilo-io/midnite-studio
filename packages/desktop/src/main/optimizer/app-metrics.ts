import { basename } from 'node:path';

import type { ProcessInfo } from '@midnite/studio-shared';
import type { ProcessMetric } from 'electron';

import { descendantsOf, isOurProcess, type ProcessRow } from '../agent-process';

/**
 * Derives a clean process command name from an argv string.
 */
export function commandName(args: string): string {
  const token = args.trim().split(/\s+/)[0] ?? '';
  return basename(token);
}

/**
 * Options configuring the merge of `ps` process rows and Electron's
 * `app.getAppMetrics()` snapshots (Phase 85 Theme E).
 */
export type MergeAppMetricsOptions = {
  /** Known root PIDs of active PTY sessions. */
  ptyPids?: readonly number[];
  /** PID of the main Midnite Studio process (defaults to `process.pid`). */
  midnitePid?: number;
  /**
   * Attribution lookup mapping PID to human-readable owner description
   * (e.g. window role, browser tab title/URL, pty session).
   */
  owners?: ReadonlyMap<number, string | null> | Record<number, string | null>;
  /**
   * Optional override for ownership check on rows not reported by Electron.
   */
  isOurProcessFn?: (
    pid: number,
    rows: readonly ProcessRow[],
    ptyPids: readonly number[],
    midnitePid?: number,
  ) => boolean;
};

function lookupOwner(
  owners: ReadonlyMap<number, string | null> | Record<number, string | null> | undefined,
  pid: number,
): string | null {
  if (!owners) return null;
  if (owners instanceof Map || typeof (owners as ReadonlyMap<number, string | null>).get === 'function') {
    return (owners as ReadonlyMap<number, string | null>).get(pid) ?? null;
  }
  return (owners as Record<number, string | null>)[pid] ?? null;
}

function defaultOwnerFromMetric(metric: ProcessMetric): string | null {
  if (metric.serviceName && metric.serviceName.trim() !== '') {
    return metric.serviceName;
  }
  if (metric.type === 'GPU') {
    return 'GPU';
  }
  if (metric.type === 'Browser') {
    return 'Main process';
  }
  return null;
}

/**
 * Pure join of OS process table rows from `ps` and Electron's `app.getAppMetrics()`.
 *
 * Requirements from Phase 85 Theme E:
 * 1. Prefers Electron's `cpu.percentCPUUsage` for PIDs Electron reports.
 * 2. Keeps `ps`'s resident memory (`rssBytes`), because Electron's
 *    `ProcessMetric` on darwin still does not expose a portable resident set
 *    we can trust over `ps` (Phase 85).
 * 3. Sets `ours: true` for every PID present in the Electron metrics array,
 *    falling back to `isOurProcess` for PTY descendants and external processes.
 * 4. Merges PIDs reported by Electron even if absent from `ps` (with `rssBytes: null`).
 * 5. Attaches attribution `owner` label from provided owner map or metric metadata.
 */
export function mergeAppMetrics(
  rows: readonly ProcessRow[],
  metrics: readonly ProcessMetric[],
  options?: MergeAppMetricsOptions,
): ProcessInfo[] {
  const midnitePid = options?.midnitePid ?? process.pid;
  const ptyPids = options?.ptyPids ?? [];
  const checkOurProcess = options?.isOurProcessFn ?? isOurProcess;
  const metricsByPid = new Map<number, ProcessMetric>(metrics.map((m) => [m.pid, m]));
  const seenPids = new Set<number>();
  const result: ProcessInfo[] = [];

  for (const row of rows) {
    seenPids.add(row.pid);
    const metric = metricsByPid.get(row.pid);
    const owner = lookupOwner(options?.owners, row.pid) ?? (metric ? defaultOwnerFromMetric(metric) : null);

    if (metric) {
      result.push({
        pid: row.pid,
        ppid: row.ppid,
        name: commandName(row.args),
        argv: row.args,
        rssBytes: row.rssBytes,
        cpuPercent: metric.cpu?.percentCPUUsage ?? row.cpuPercent,
        ours: true,
        owner,
      });
    } else {
      result.push({
        pid: row.pid,
        ppid: row.ppid,
        name: commandName(row.args),
        argv: row.args,
        rssBytes: row.rssBytes,
        cpuPercent: row.cpuPercent,
        ours: checkOurProcess(row.pid, rows, ptyPids, midnitePid),
        owner,
      });
    }
  }

  // Handle processes reported by Electron but missed by `ps` between reads.
  for (const metric of metrics) {
    if (!seenPids.has(metric.pid)) {
      seenPids.add(metric.pid);
      const name = metric.name || metric.serviceName || metric.type || 'Electron Helper';
      const owner = lookupOwner(options?.owners, metric.pid) ?? defaultOwnerFromMetric(metric);
      result.push({
        pid: metric.pid,
        ppid: midnitePid,
        name,
        argv: name,
        rssBytes: null,
        cpuPercent: metric.cpu?.percentCPUUsage ?? null,
        ours: true,
        owner,
      });
    }
  }

  return result;
}

/**
 * Propagate owner labels from root PIDs to all transitive descendants in `rows`.
 */
export function propagateOwnerToDescendants(
  rows: readonly ProcessRow[],
  rootOwners: ReadonlyMap<number, string>,
): Map<number, string> {
  const fullOwners = new Map<number, string>(rootOwners);
  for (const [rootPid, label] of rootOwners) {
    const descendants = descendantsOf(rows, rootPid);
    for (const desc of descendants) {
      if (!fullOwners.has(desc.row.pid)) {
        fullOwners.set(desc.row.pid, label);
      }
    }
  }
  return fullOwners;
}
