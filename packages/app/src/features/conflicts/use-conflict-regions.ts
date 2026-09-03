import { useQuery } from '@tanstack/react-query';
import type { ConflictedHunk } from '@midnite/studio-shared';

import { bridge } from '../../services/bridge';
import { keys } from '../../services/queries';

/**
 * A conflicted path's regions, re-parsed fresh on every fetch.
 *
 * Nested under `keys.status(...)` (see `queries.ts`), so the watcher's own
 * worktree/index invalidation is what makes an accepted region disappear
 * here — the same "server state is authoritative but not synchronous"
 * reconciliation the rest of the app already relies on, not a bespoke local
 * append. `applyConflictHunk` also writes the file directly, which the
 * watcher classifies as a worktree event regardless of which process wrote it.
 */
export function useConflictRegions({
  repoId,
  worktreePath,
  path,
}: {
  repoId: string;
  worktreePath?: string;
  path: string;
}): { hunks: ConflictedHunk[]; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: keys.conflictRegions(repoId, worktreePath, path),
    queryFn: async () =>
      bridge()?.status.conflictRegions({
        repoId,
        path,
        ...(worktreePath ? { worktreePath } : {}),
      }) ?? [],
  });

  return { hunks: data ?? [], isLoading };
}
