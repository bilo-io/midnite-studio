import { statfs } from 'node:fs/promises';

import { clampPercent } from './cpu';

/**
 * Filesystem **capacity** for the boot volume. Not throughput.
 *
 * There is no `iostat` here and no I/O timeline, on purpose: read/write rates
 * are a different question from "am I about to run out of room", and the footer
 * answers the second one. It is also why disk gets a gauge in the flyout rather
 * than a fourth area chart — a capacity line is flat for hours, and drawing it
 * as a timeline would imply movement that is not there.
 *
 * `bavail`, not `bfree`. The two differ by the reserve the filesystem keeps for
 * root, so `bfree` describes space a normal process cannot actually have.
 * `df` reports `bavail`, and a figure that disagrees with `df` is a figure
 * nobody can check.
 */

export type DiskReading = {
  /** 0–100. Matches `df`'s Capacity column. */
  percent: number;
  used: number;
  /**
   * `used + available`, NOT the raw volume size.
   *
   * The root reserve is in neither term, so this is the denominator the
   * percentage was actually computed against — which is what makes the gauge
   * and the percentage beside it agree. Using the raw size here would render a
   * gauge that visibly disagrees with its own label.
   */
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

/**
 * Read the volume holding `path`.
 *
 * Called on a much coarser schedule than the other probes (see
 * metrics-service.ts): capacity moves in gigabytes over hours, so sampling it
 * every two seconds would be a syscall per tick to redraw an identical number.
 */
export async function probeDisk(path = '/'): Promise<DiskReading | undefined> {
  try {
    return diskFromStatfs(await statfs(path));
  } catch {
    return undefined;
  }
}
