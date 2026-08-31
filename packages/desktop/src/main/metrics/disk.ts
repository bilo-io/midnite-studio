import { execFile } from 'node:child_process';
import { statfs } from 'node:fs/promises';
import { promisify } from 'node:util';

import { clampPercent } from './cpu';

const exec = promisify(execFile);

/** Absolute path: a Finder-launched Electron app inherits launchd's bare PATH. */
const DF = '/bin/df';

/**
 * Filesystem **capacity** for the boot volume. Not throughput.
 *
 * There is no `iostat` here and no I/O timeline, on purpose: read/write rates
 * are a different question from "am I about to run out of room", and the footer
 * answers the second one. It is also why disk gets a gauge in the flyout rather
 * than a fourth area chart — a capacity line is flat for hours, and drawing it
 * as a timeline would imply movement that is not there.
 *
 * **`statfs()` alone over-reports "used" on darwin.** Since Catalina the boot
 * volume is split into a read-only System volume and a writable Data volume
 * sharing one APFS container; `statfs()` on either mount returns the *same*
 * container-wide `f_blocks`/`f_bfree`, so `blocks - bfree` counts the other
 * volume's files — and local snapshot/purgeable space Finder treats as
 * reclaimable — as "used" here too. That gap is exactly why this footer once
 * read tens of GB higher than System Settings ▸ Storage for the same disk.
 * `df(1)`'s Used column does not have that problem: it reports what is
 * actually on the volume queried, so darwin shells out to it against the
 * Data volume instead of trusting the syscall. Everywhere else falls back to
 * `statfs`, where there is no System/Data split to get wrong.
 */

export type DiskReading = {
  /** 0–100. */
  percent: number;
  used: number;
  total: number;
};

/** The subset of `StatsFs` this needs, so a test can hand over a literal. */
export type StatfsLike = {
  bsize: number;
  blocks: number;
  bfree: number;
  bavail: number;
};

/** Pure: turn a `statfs` result into `df`'s used / available / capacity. */
export function diskFromStatfs(stats: StatfsLike): DiskReading | undefined {
  const { bsize, blocks, bfree, bavail } = stats;
  if (bsize <= 0 || blocks <= 0) return undefined;

  const used = Math.max(blocks - bfree, 0) * bsize;
  const available = Math.max(bavail, 0) * bsize;
  const denominator = used + available;
  if (denominator <= 0) return undefined;

  return { percent: clampPercent((used / denominator) * 100), used, total: denominator };
}

/** The columns this needs out of `df -k`'s data row, in 1024-byte blocks. */
export type DfLike = {
  totalKb: number;
  usedKb: number;
  availableKb: number;
};

/**
 * Parse `df -k <path>`'s data row. Total, never throws — returns `undefined`
 * on anything that does not contain the "blocks used available NN%" run df
 * always prints, which is true of an error message (no such path) too.
 *
 * Anchored on the trailing `NN%`, not fixed column positions: a long device
 * name (common for encrypted APFS volumes) makes `df` wrap onto two lines,
 * which shifts where the Filesystem field lands but not this run of numbers.
 */
export function parseDf(output: string): DfLike | undefined {
  const dataLine = output.trim().split('\n').at(-1);
  if (dataLine === undefined) return undefined;

  const match = /(\d+)\s+(\d+)\s+(\d+)\s+\d+%/.exec(dataLine);
  if (!match) return undefined;

  return { totalKb: Number(match[1]), usedKb: Number(match[2]), availableKb: Number(match[3]) };
}

/** Pure: `df`'s own used / total, which is per-volume where `statfs` is not. */
export function diskFromDf(df: DfLike): DiskReading | undefined {
  if (df.totalKb <= 0) return undefined;

  const used = Math.max(df.usedKb, 0) * 1024;
  const total = Math.max(df.totalKb, 0) * 1024;
  return { percent: clampPercent((used / total) * 100), used, total };
}

/**
 * Read the volume holding `path`.
 *
 * Called on a much coarser schedule than the other probes (see
 * metrics-service.ts): capacity moves in gigabytes over hours, so sampling it
 * every two seconds would be a syscall per tick to redraw an identical number.
 *
 * On darwin, `/` resolves to the read-only System volume — almost empty by
 * design — so the Data volume (where user files actually live, and what
 * Finder measures) is queried instead. A caller-supplied non-root path is
 * assumed to already name the volume it cares about.
 */
export async function probeDisk(
  path = '/',
  run: (target: string) => Promise<string> = runDf,
): Promise<DiskReading | undefined> {
  if (process.platform === 'darwin') {
    const target = path === '/' ? '/System/Volumes/Data' : path;
    try {
      const parsed = parseDf(await run(target));
      const reading = parsed && diskFromDf(parsed);
      if (reading !== undefined) return reading;
    } catch {
      // Fall through to statfs below.
    }
  }

  try {
    return diskFromStatfs(await statfs(path));
  } catch {
    return undefined;
  }
}

async function runDf(target: string): Promise<string> {
  const { stdout } = await exec(DF, ['-k', target], { timeout: 2_000 });
  return stdout;
}
