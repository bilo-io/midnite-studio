import type { StatusCode, StatusEntry, StatusResult } from '@midnite/git-shared';

import { primaryCode } from '../status/status-mark';

/** What `StatusMark` needs to render one badge, independent of file vs directory. */
export type StatusBadge = { code: StatusCode; conflicted: boolean };

/**
 * Worst-first, for collapsing many descendants into one directory badge.
 *
 * Not the full ten `StatusCode` values: `unmodified` never reaches here
 * (`status.entries` only lists paths that changed) and `ignored` never does
 * either (`getStatus` runs with `--ignored=no`, deliberately, per
 * `commands/status.ts`).
 */
const SEVERITY: readonly string[] = [
  'untracked',
  'copied',
  'renamed',
  'added',
  'typeChanged',
  'modified',
  'deleted',
  'conflicted',
];

const severityKey = ({ code, conflicted }: StatusBadge): string => (conflicted ? 'conflicted' : code);

const worseOf = (a: StatusBadge, b: StatusBadge): StatusBadge =>
  SEVERITY.indexOf(severityKey(b)) > SEVERITY.indexOf(severityKey(a)) ? b : a;

export type FileStatusIndex = {
  /** One lookup per changed path — `StatusEntry.path` matches `file-tree.tsx`'s `relPath` byte for byte, so no normalisation belongs here. */
  byPath: ReadonlyMap<string, StatusBadge>;
  /** The worst descendant badge per literal directory `relPath` — every ancestor level, not the collapsed chains `build-change-tree.ts` produces for the Changes panel. */
  dirRollup: ReadonlyMap<string, StatusBadge>;
};

/** Built once per status fetch; a tree row then costs one `Map.get`, not a subprocess or a scan. */
export function buildFileStatusIndex(entries: readonly StatusEntry[]): FileStatusIndex {
  const byPath = new Map<string, StatusBadge>();
  const dirRollup = new Map<string, StatusBadge>();

  for (const entry of entries) {
    const badge: StatusBadge = { code: primaryCode(entry), conflicted: entry.conflicted };
    byPath.set(entry.path, badge);

    const segments = entry.path.split('/').filter((segment) => segment.length > 0);
    let prefix = '';
    for (const segment of segments.slice(0, -1)) {
      prefix = prefix === '' ? segment : `${prefix}/${segment}`;
      const existing = dirRollup.get(prefix);
      dirRollup.set(prefix, existing ? worseOf(existing, badge) : badge);
    }
  }

  return { byPath, dirRollup };
}

/**
 * The honesty guard from `use-status.ts`: a placeholder is an *empty* status,
 * so building an index from it would render every row as "no badge" — which
 * looks identical to "clean" rather than to "not yet answered". Returning
 * `undefined` here keeps that distinction the way `useAllChangesTotals`
 * already does for the same reason.
 */
export function resolveFileStatusIndex(
  data: StatusResult | undefined,
  isPlaceholderData: boolean,
): FileStatusIndex | undefined {
  if (isPlaceholderData) return undefined;
  return buildFileStatusIndex(data?.entries ?? []);
}
