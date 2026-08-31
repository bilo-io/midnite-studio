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
    // Still loading, not "zero repos": `useRepos` starts every mount with a
    // beat of `data === undefined`, and treating that as empty cleared a
    // perfectly good persisted `selectedRepoId` before the list even
    // arrived — a `selectRepo(null)` this effect has no way to take back,
    // since the repair below only runs once a selection already exists.
    if (repos === undefined) {
      return;
    }

    if (repos.length === 0) {
      if (selectedRepoId !== null) {
        useUiStore.getState().selectRepo(null);
      }
      return;
    }

    if (!selectedRepoId) {
      return;
    }

    const current = repos.find((repo) => repo.id === selectedRepoId);
    if (!current) {
      return;
    }

    const store = useUiStore.getState();
    const worktreeStillExists =
      selectedWorktreePath !== null &&
      current.worktrees.some((w) => w.path === selectedWorktreePath);

    // Default to the main worktree; a repo's other checkouts are opt-in.
    if (!selectedWorktreePath || !worktreeStillExists) {
      const main = current.worktrees.find((w) => w.isMain) ?? current.worktrees[0];
      if (main) store.selectWorktree(main.path);
    }
  }, [repos, selectedRepoId, selectedWorktreePath]);
}
