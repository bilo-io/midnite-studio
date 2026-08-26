import { cpus, loadavg, platform } from 'node:os';

/**
 * CPU utilisation from `os.cpus()`.
 *
 * The times it reports are **cumulative counters since boot**, not rates, so a
 * single read is meaningless — `idle: 4_912_340` says nothing about whether the
 * machine is busy *now*. Usage only exists between two reads:
 *
 *     1 - (idleNow - idleThen) / (totalNow - totalThen)
 *
 * which is why this module is a snapshot type plus a pure difference, rather
 * than a `getCpuUsage()` that could only ever return an average over the
 * machine's entire uptime.
 *
 * No `electron` import: the probe stays runnable under bare vitest, the same
 * property `repo-store.ts` keeps by taking its directory as an argument.
 */

/** One cumulative reading, already summed across cores. */
export type CpuSnapshot = {
  /** Cumulative idle ticks across every core. */
  idle: number;
  /** Cumulative ticks in every mode, idle included. */
  total: number;
  cores: number;
};

/** Sum the per-core counters `os.cpus()` hands back. Pure — takes the array. */
export function snapshotCpuTimes(entries: readonly { times: Record<string, number> }[]): CpuSnapshot {
  let idle = 0;
  let total = 0;
  for (const entry of entries) {
    for (const [mode, ticks] of Object.entries(entry.times)) {
      total += ticks;
      if (mode === 'idle') idle += ticks;
    }
  }
  return { idle, total, cores: entries.length };
}

/**
 * Utilisation between two snapshots, as a 0–100 percentage.
 *
 * Returns `undefined` rather than 0 when the counters did not advance. That
 * happens on the very first tick (there is no previous snapshot) and whenever
 * two reads land inside the same clock tick — neither is evidence of an idle
 * machine, and reporting 0 would draw a dip that never happened.
 */
export function cpuUsageBetween(previous: CpuSnapshot, next: CpuSnapshot): number | undefined {
  const totalDelta = next.total - previous.total;
  const idleDelta = next.idle - previous.idle;
  // A counter that went backwards means the process was suspended across a
  // sleep, or the core set changed; either way the difference is not a rate.
  if (totalDelta <= 0 || idleDelta < 0) return undefined;
  const used = 1 - idleDelta / totalDelta;
  return clampPercent(used * 100);
}

/**
 * The 1-minute load average, or `undefined` where the platform has none.
 *
 * libuv hard-codes `os.loadavg()` to `[0, 0, 0]` on win32. Reporting that as a
 * genuine 0.00 would be indistinguishable from an idle machine, and the whole
 * point of the optional fields on `MetricSample` is that "cannot tell" and
 * "zero" stay different answers.
 */
export function loadAverage1(): number | undefined {
  if (platform() === 'win32') return undefined;
  const [one] = loadavg();
  return typeof one === 'number' ? one : undefined;
}

/**
 * A stateful CPU probe: holds the previous snapshot so callers do not have to.
 *
 * The first call always returns `undefined` — there is nothing to difference
 * against yet. That is deliberate rather than a wart: the store seeds its
 * series from the first sample that actually carries a value, so an early
 * `undefined` costs one tick of an empty sparkline, where a fabricated 0 would
 * cost a permanent spike in the history.
 */
export function createCpuProbe(read: () => CpuSnapshot = readCpuSnapshot) {
  let previous: CpuSnapshot | null = null;
  return {
    sample(): { usage: number | undefined; cores: number } {
      const next = read();
      const usage = previous === null ? undefined : cpuUsageBetween(previous, next);
      previous = next;
      return { usage, cores: next.cores };
    },
  };
}

const readCpuSnapshot = (): CpuSnapshot => snapshotCpuTimes(cpus());

export const clampPercent = (value: number): number =>
  Math.min(100, Math.max(0, Math.round(value * 10) / 10));
