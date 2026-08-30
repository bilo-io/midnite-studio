import { pickForgeRemote, type ForgePull } from '@midnite/studio-shared';

import { useForgePulls, useRemotes } from '../../services/queries';
import { useActiveWorktree, useRepoStatus } from '../../services/use-status';
import { useUiStore } from '../../store/ui-store';
import { checksStatus, StatusPill } from '../forge/forge-status';

/** Pure: the open PR whose head branch matches the checked-out branch, if any. */
export function findPrForBranch(pulls: readonly ForgePull[], head: string | null): ForgePull | null {
  if (head === null) return null;
  return pulls.find((pull) => pull.headBranch === head) ?? null;
}

/**
 * The checks rollup for the PR on the currently checked-out branch, from
 * `forge-status.tsx`.
 *
 * A worst-of rollup across every open PR was considered and rejected: a red
 * light for a colleague's branch is noise you cannot act on from a status
 * bar. No match — the common case — renders nothing, and a repo with no
 * GitHub remote never even fetches.
 */
export function ChecksVerdictSegment() {
  const target = useActiveWorktree();
  const { repoId } = target;
  const { data: remotes } = useRemotes(repoId);
  const hasForge = pickForgeRemote(remotes ?? [])?.forge?.kind === 'github';

  const { data: status, isPlaceholderData } = useRepoStatus(target);
  const loaded = isPlaceholderData ? undefined : status;

  const pullsQuery = useForgePulls(repoId, hasForge);
  // useForgePulls sets no placeholderData, so `data === undefined` is the
  // guard here rather than `isPlaceholderData`.
  const pulls = pullsQuery.data?.pulls;

  const pull = pulls ? findPrForBranch(pulls, loaded?.branch.head ?? null) : null;
  if (!pull) return null;

  const verdict = checksStatus(pull);
  if (!verdict) return null;

  return (
    <button
      type="button"
      data-testid="status-segment-checks-verdict"
      onClick={() => useUiStore.getState().setActiveView('actions')}
      className="rounded px-1.5 transition-colors hover:bg-accent"
    >
      <StatusPill status={verdict} />
    </button>
  );
}
