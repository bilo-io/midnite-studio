/**
 * "just now", "5m ago", "3h ago", "2d ago" — the compact age every list row
 * wears. Moved to the frame (Phase 113 Theme N) from `sessions/session-order.ts`
 * so a feature can show an age without importing another feature.
 */
export function relativeAge(ms: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - ms) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}
