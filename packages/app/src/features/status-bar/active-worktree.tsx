import { useRepos } from '../../services/queries';
import { useActiveWorktree } from '../../services/use-status';
import { useUiStore } from '../../store/ui-store';

/**
 * The checkout the sidebar selection points at — the same source
 * `DiagnosticsSegment` follows, and for the reason its comment gives:
 * several tabs can point at different repositories, so the two genuinely
 * disagree. Makes the bar's own scope explicit instead of implicit.
 *
 * Renders nothing when nothing is selected. Renders the worktree's basename
 * when one is selected (the primary checkout is not worth a second label
 * beside the repo name), otherwise the repo name.
 */
export function ActiveWorktreeSegment() {
  const { repoId, worktreePath } = useActiveWorktree();
  const repos = useRepos();

  if (repoId === null) return null;

  const repo = repos.data?.find((entry) => entry.id === repoId);
  if (!repo) return null;

  const label = worktreePath ? basename(worktreePath) : repo.name;

  return (
    <button
      type="button"
      data-testid="status-segment-worktree"
      onClick={() => {
        useUiStore.getState().setReposOpen(true);
        // "Focuses" means moving DOM focus to the panel, not just revealing
        // it — a click that only opens it leaves the keyboard where it was.
        document.querySelector<HTMLElement>('aside[aria-label="Repositories"]')?.focus();
      }}
      title={worktreePath ?? repo.path}
      className="max-w-[180px] truncate rounded px-1.5 transition-colors hover:bg-accent hover:text-foreground"
    >
      {label}
    </button>
  );
}

/** `/a/b/my-worktree` → `my-worktree`. Trailing slash tolerant. */
function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}
