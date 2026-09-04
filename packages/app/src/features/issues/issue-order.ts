import type { ForgeIssue } from '@midnite/studio-shared';

/** Most recently updated first — the Issues view's own default order. */
export function sortByUpdated(issues: readonly ForgeIssue[]): ForgeIssue[] {
  return [...issues].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** The issue the list opens on with no explicit selection — the most recently updated one. */
export function pickInitialIssue(issues: readonly ForgeIssue[]): number | null {
  return sortByUpdated(issues)[0]?.number ?? null;
}

/**
 * Same relative-age format `features/actions/run-groups.ts` uses for its own
 * rows — duplicated rather than imported across features, since the two
 * modules have no other reason to depend on each other.
 */
export function relativeAge(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}
