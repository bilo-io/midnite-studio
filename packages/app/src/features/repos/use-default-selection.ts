import { useEffect } from 'react';

import { useRepos } from '../../services/queries';
import { useUiStore } from '../../store/ui-store';

/**
 * Select something as soon as there is something to select.
 *
 * Opening the app to "No repository selected" while the sidebar already lists
 * three repositories is a dead end — the user has to click before the app does
 * anything, every launch. This picks the first repo and its main worktree, and
 * gets out of the way the moment a selection exists.
 *
 * It also repairs a selection that no longer resolves: closing the selected
 * repo, or a repo disappearing from disk between sessions, would otherwise
 * leave a `selectedRepoId` pointing at nothing and every query returning empty.
 * The same repair applies to a selected *worktree* that vanishes on its own —
 * e.g. `git worktree remove` run outside the app — while its repo stays open:
 * without this, the sidebar keeps the dead worktree "selected" and every
 * status query keyed to it keeps re-requesting a path that no longer exists.
 */
export function useDefaultSelection(): void {
  const { data: repos } = useRepos();
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const selectedWorktreePath = useUiStore((s) => s.selectedWorktreePath);

  useEffect(() => {
    if (!repos || repos.length === 0) return;

    const current = repos.find((repo) => repo.id === selectedRepoId);
    const target = current ?? repos[0];
    if (!target) return;

    const store = useUiStore.getState();
    if (!current) store.selectRepo(target.id);

    const worktreeStillExists =
      selectedWorktreePath !== null &&
      target.worktrees.some((w) => w.path === selectedWorktreePath);

    // Default to the main worktree; a repo's other checkouts are opt-in.
    if (!current || !selectedWorktreePath || !worktreeStillExists) {
      const main = target.worktrees.find((w) => w.isMain) ?? target.worktrees[0];
      if (main) store.selectWorktree(main.path);
    }
  }, [repos, selectedRepoId, selectedWorktreePath]);
}
