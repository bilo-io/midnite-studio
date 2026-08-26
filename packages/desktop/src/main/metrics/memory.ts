import { execFile } from 'node:child_process';
import { freemem, totalmem } from 'node:os';
import { promisify } from 'node:util';

import { clampPercent } from './cpu';

/**
 * Physical memory pressure on darwin, read the way Activity Monitor reads it.
 *
 * **`os.freemem()` is not the answer here.** On macOS it reports the free page
 * count, and the kernel deliberately keeps almost none: pages that held a file
 * you read an hour ago stay resident as cache until something else wants them.
 * So `os.freemem()` on a healthy 32 GB machine routinely reads under 200 MB,
 * and `1 - free/total` renders as 99% used — permanently, on an idle laptop.
 *
 * Activity Monitor's "Memory Used" is a different sum, and the one worth
 * showing:
 *
 *     max(anonymous - purgeable, 0) + wired + compressed
 *
 * Anonymous pages are process memory with no file behind them; purgeable ones
 * are the subset the app has told the kernel it may reclaim for free, so they
 * are not really *used*. Wired pages cannot be paged out at all. Compressed
 * pages are what the memory compressor is holding.
 *
 * The page size **must** come from the header — Apple Silicon uses 16 KiB
 * pages, so a hardcoded 4096 under-reports by exactly 4×. That single constant
 * is the difference between "12 GB used" and "3 GB used".
 *
 * The parser is pure and the `execFile` wrapper is separate, so the formula is
 * testable against captured output without a mac in the loop.
 */

const exec = promisify(execFile);

/** Absolute path: a Finder-launched Electron app inherits launchd's bare PATH. */
const VM_STAT = '/usr/bin/vm_stat';

export type MemoryReading = {
  /** 0–100, already clamped. */
  percent: number;
  used: number;
  total: number;
};

/**
 * The page counts `vm_stat` prints, in pages.
 *
 * Every field is optional because `vm_stat`'s field set has changed across
 * releases; the caller decides what a missing one means rather than the parser
 * inventing a zero.
 */
export type VmStat = {
  pageSize: number;
  anonymous?: number;
  purgeable?: number;
  wired?: number;
  compressed?: number;
};

/**
 * Parse `vm_stat` output. Total, never throws — returns `null` when it cannot
 * even find the page size, which is the one field with no sane default.
 */
export function parseVmStat(output: string): VmStat | null {
  const pageSize = /page size of (\d+) bytes/.exec(output)?.[1];
  if (pageSize === undefined) return null;

  // Values are printed with a trailing '.', and the counts run to ten-plus
  // digits on a machine that has been up for a while.
  const field = (label: string): number | undefined => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`^${escaped}:\\s+(\\d+)\\.?\\s*$`, 'm').exec(output);
    return match?.[1] === undefined ? undefined : Number(match[1]);
  };

  return {
    pageSize: Number(pageSize),
    anonymous: field('Anonymous pages'),
    purgeable: field('Pages purgeable'),
    wired: field('Pages wired down'),
    compressed: field('Pages occupied by compressor'),
  };
}

/**
 * Activity Monitor's "Memory Used", in bytes.
 *
 * Returns `undefined` when the fields the formula needs are absent — a partial
 * sum would be a plausible-looking number that is simply wrong, and the caller
 * has a real fallback to reach for instead.
 */
export function memoryUsedBytes(stat: VmStat): number | undefined {
  const { anonymous, wired, compressed } = stat;
  if (anonymous === undefined || wired === undefined || compressed === undefined) {
    return undefined;
  }
  // `purgeable` genuinely may be absent; treating it as 0 over-reports usage
  // slightly, which is the safe direction and matches what vm_stat implies.
  const purgeable = stat.purgeable ?? 0;
  const anonymousInUse = Math.max(anonymous - purgeable, 0);
  return (anonymousInUse + wired + compressed) * stat.pageSize;
}

/**
 * The `os.freemem()` reading, kept as a degraded fallback rather than dropped.
 *
 * It reads high on macOS for the reasons above, but "high and present" beats
 * "absent" when the alternative is a footer that shows no RAM at all because
 * one regex stopped matching after an OS update.
 */
export function freememFallback(
  total: number = totalmem(),
  free: number = freemem(),
): MemoryReading | undefined {
  if (total <= 0) return undefined;
  const used = Math.max(total - free, 0);
  return { percent: clampPercent((used / total) * 100), used, total };
}

/** Read memory on darwin, degrading to `os.freemem()` on any parse failure. */
export async function probeMemory(
  run: () => Promise<string> = runVmStat,
): Promise<MemoryReading | undefined> {
  if (process.platform !== 'darwin') return freememFallback();

  let output: string;
  try {
    output = await run();
  } catch {
    return freememFallback();
  }

  const stat = parseVmStat(output);
  if (stat === null) return freememFallback();

  const used = memoryUsedBytes(stat);
  const total = totalmem();
  if (used === undefined || total <= 0) return freememFallback();

  return { percent: clampPercent((used / total) * 100), used, total };
}

async function runVmStat(): Promise<string> {
  const { stdout } = await exec(VM_STAT, [], { timeout: 2_000 });
  return stdout;
}
