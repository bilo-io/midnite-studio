import { CHANNELS, schemas, type RepoStats } from '@midnite/studio-shared';
import { computeStats, invalidateStats } from '@midnite/studio-git-engine';

import { resolveWorkdir } from '../repo-registry';
import { handle } from './handle';

/**
 * Repository statistics IPC.
 *
 * The channel takes a **`repoId` only** — never a path. Main resolves the
 * checkout through `resolveWorkdir`, which validates any renderer-supplied
 * worktree against the real `git worktree list`, so the renderer cannot point
 * a history traversal at an arbitrary directory. Same rule as
 * `forge-handlers.ts` and the diagnostics channels.
 *
 * The memoisation lives in git-engine beside the aggregators rather than here,
 * because its key has to be a digest of every ref tip — something only the
 * engine can compute — and because keeping it there leaves the whole thing
 * testable under bare vitest.
 */
export function registerStatsHandlers(): void {
  handle(
    CHANNELS.statsSummary,
    schemas.StatsSummaryRequest,
    async (req): Promise<RepoStats> => {
      const repoPath = await resolveWorkdir(req.repoId);
      if (repoPath === null) return emptyStats(req.repoId, req.window);
      return computeStats({
        repoId: req.repoId,
        repoPath,
        window: req.window,
        withChurn: req.withChurn,
      });
    },
    // An invalid payload is an empty dashboard, not a rejection: the renderer
    // asks on selection, and every widget already renders the zero case. A
    // throw here would surface as an opaque "Error invoking remote method".
    () => emptyStats('', '90d'),
  );
}

/** Re-exported so the watcher can drop a repo's statistics when refs move. */
export { invalidateStats };

const emptyStats = (repoId: string, window: RepoStats['window']): RepoStats => ({
  repoId,
  window,
  generatedAt: Date.now(),
  truncated: false,
  commitsScanned: 0,
  calendar: [],
  contributors: [],
  activity: [],
  churn: null,
  health: {
    localBranches: 0,
    remoteBranches: 0,
    tags: 0,
    staleByAge: 0,
    mergedBranches: 0,
    oldestUnmergedAt: null,
    sizeBytes: null,
    looseObjects: null,
  },
});
