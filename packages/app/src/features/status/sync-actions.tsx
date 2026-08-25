import { GitBranch } from 'lucide-react';

import { useActiveWorktree, useStatus } from '../../services/use-status';
import { useUiStore } from '../../store/ui-store';
import { AheadBehind, SyncControls } from './sync-controls';

/**
 * Branch state and the three sync actions, for the selected checkout.
 *
 * Lives in the title bar rather than inside the Changes view, where it used to
 * be: "do I need to push or pull" is checked constantly and from whichever view
 * you happen to be in — hiding it behind a tab makes it unanswerable from the
 * graph, which is where most of the time is spent.
 *
 * The buttons themselves are <SyncControls>, shared with the sidebar's
 * per-repository headers, so the two cannot disagree about when Push is live.
 */
export function SyncActions({ onError }: { onError?: (message: string) => void }) {
  const repoId = useUiStore((s) => s.selectedRepoId);
  const target = useActiveWorktree();
  const { data: status } = useStatus();

  // Nothing to sync and nothing to name: render nothing rather than a row of
  // dead buttons over an empty workspace.
  if (!repoId || !status) return null;

  const branch = status.branch;

  return (
    <div className="flex items-center gap-1 text-xs">
      <span
        className="flex min-w-0 items-center gap-1 text-muted-foreground"
        title={branch.head ?? 'detached HEAD'}
      >
        <GitBranch aria-hidden className="h-3.5 w-3.5 shrink-0" />
        <span className="max-w-[12rem] truncate">
          {branch.unborn ? `${branch.head ?? 'main'} (no commits)` : (branch.head ?? 'detached')}
        </span>
      </span>

      <AheadBehind branch={branch} />

      <SyncControls target={target} branch={branch} {...(onError ? { onError } : {})} />
    </div>
  );
}
