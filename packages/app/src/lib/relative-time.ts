/**
 * Compact relative time with sub-day granularity: "just now", "12m ago",
 * "3h ago", then "3d"/"5w"/"2mo"/"2y" (the dashboard's column-width form).
 *
 * Only meaningful where the source carries a time-of-day. Commit timestamps
 * (`RepoStats.activity[].at`, `contributors[].lastAt`) are epoch seconds with a
 * time component; calendar day buckets are not, and must not use this.
 */
export function formatRelativeTime(epochSeconds: number, nowMs: number = Date.now()): string {
  const secs = Math.max(0, Math.floor(nowMs / 1000 - epochSeconds));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  if (days < 60) return `${Math.floor(days / 7)}w`;
  if (days < 730) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

/** Full local date-time for a tooltip. */
export function absoluteTime(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleString();
}
