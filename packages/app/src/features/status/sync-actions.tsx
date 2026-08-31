import { useActiveWorktree, useStatus } from '../../services/use-status';
import { useUiStore } from '../../store/ui-store';
import { SyncControls } from './sync-controls';

/**
 * The sync button, for the selected checkout.
 *
 * Lives beside the repo/branch breadcrumb rather than inside the Changes view,
 * where it used to be: "do I need to push or pull" is checked constantly and
 * from whichever view you happen to be in — hiding it behind a tab makes it
 * unanswerable from the graph, which is where most of the time is spent.
 *
 * No branch label here — the breadcrumb right beside it already names the
 * branch, and a second copy would just be the same word twice in one strip.
 *
 * The button itself is <SyncControls>, shared with the sidebar's per-repository
 * headers, so the two cannot disagree about what a sync will do. It carries its
 * own ahead/behind counts — they are the reading the click acts on, and a pair
 * sitting a few pixels away from the control that consumes them was two things
 * to look at where there is one decision.
 */
export function SyncActions({ onError }: { onError?: (message: string) => void }) {
  const repoId = useUiStore((s) => s.selectedRepoId);
  const target = useActiveWorktree();
  const { data: status } = useStatus();

  // Nothing to sync: render nothing rather than a dead button over an empty
  // workspace.
  if (!repoId || !status) return null;

  return (
    <SyncControls
      target={target}
      branch={status.branch}
      size="sm"
      {...(onError ? { onError } : {})}
    />
  );
}
