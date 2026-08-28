import { useActiveWorktree, useRepoStatus } from '../../services/use-status';
import { INPROGRESS_LABEL } from '../status/conflict-banner';
import { useUiStore } from '../../store/ui-store';

/**
 * `merge` / `rebase` / `cherry-pick` / `revert`, from `StatusResult.inProgress`.
 *
 * The one sanctioned exception to the bar's anti-duplication rule: the title
 * bar does not show this at all, and a rebase you have forgotten you are in
 * the middle of is the single most expensive thing this bar can tell you.
 * Click navigates to the Changes view, where Abort/Continue live — it does
 * not offer them itself.
 */
export function InProgressSegment() {
  const { data: status, isPlaceholderData } = useRepoStatus(useActiveWorktree());
  // Collapse the placeholder before reading it, or this is correctly silent
  // by accident rather than by rule — and would stay silent for a real
  // mid-rebase repo during the first fetch.
  const loaded = isPlaceholderData ? undefined : status;

  const op = loaded?.inProgress;
  if (!op) return null;

  return (
    <button
      type="button"
      data-testid="status-segment-in-progress"
      onClick={() => useUiStore.getState().setActiveView('changes')}
      className="rounded px-1.5 font-medium text-destructive transition-colors hover:bg-accent"
    >
      {INPROGRESS_LABEL[op]} in progress
    </button>
  );
}
