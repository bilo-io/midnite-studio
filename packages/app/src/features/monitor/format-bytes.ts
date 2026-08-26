/**
 * Byte figures for a legend, in the units the OS reports them in.
 *
 * GB, not GiB: `vm_stat` and `statfs` give bytes, and every macOS surface the
 * user could compare this against — Activity Monitor, Finder's Get Info, `df -h`
 * since 10.6 — divides by 1000. Matching the platform matters more than
 * matching the binary prefix, because the whole value of the number is that it
 * can be checked against something else.
 */
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  // One decimal from GB up, none below: "12.4 GB" is a figure you read, and
  // "812.3 MB" is three digits of noise on a number nobody compares that
  // closely.
  const decimals = unit >= 3 && value < 100 ? 1 : 0;
  return `${value.toFixed(decimals)} ${UNITS[unit]}`;
}

/** "12.4 / 32 GB" — the pair a percentage cannot say on its own. */
export const formatUsage = (used: number, total: number): string =>
  `${formatBytes(used)} / ${formatBytes(total)}`;
