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
  const label = useInProgressLabel();
  if (label === null) return null;

  return (
    <button
      type="button"
      data-testid="status-segment-in-progress"
      onClick={() => useUiStore.getState().setActiveView('changes')}
      className="rounded px-1.5 font-medium text-destructive transition-colors hover:bg-accent"
    >
      {label}
    </button>
  );
}

/**
 * The `aria-live` half, mounted by `StatusBar` directly rather than through
 * `STATUS_SEGMENTS` — not as a sibling inside `InProgressSegment` itself,
 * because at `collapsed` density `collapseFor` moves this segment's *entire*
 * zone into `OverflowPopover`, which only mounts its children while the user
 * has it open. A live region living inside the segment would go silent in
 * exactly the narrow-window state where the visual readout is hardest to
 * notice — the one announcement that matters most going unheard.
 *
 * Always mounted regardless: `sr-only` is `position: absolute`, so it takes
 * no part in any flex layout — there is no `gap-3` slot to worry about here,
 * since it never lives inside a zone at all. A screen reader only reliably
 * announces an `aria-live` *mutation*, not a whole node inserted already
 * carrying the content, which is the other reason this cannot simply be an
 * attribute on the conditionally-rendered button above.
 */
export function InProgressLiveRegion() {
  const label = useInProgressLabel();
  return (
    <span aria-live="polite" className="sr-only">
      {label}
    </span>
  );
}

function useInProgressLabel(): string | null {
  const { data: status, isPlaceholderData } = useRepoStatus(useActiveWorktree());
  // Collapse the placeholder before reading it, or this is correctly silent
  // by accident rather than by rule — and would stay silent for a real
  // mid-rebase repo during the first fetch.
  const loaded = isPlaceholderData ? undefined : status;

  const op = loaded?.inProgress;
  return op ? `${INPROGRESS_LABEL[op]} in progress` : null;
}
