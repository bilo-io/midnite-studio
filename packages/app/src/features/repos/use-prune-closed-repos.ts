import { useEffect } from 'react';

import { useRepos } from '../../services/queries';
import { useUiStore } from '../../store/ui-store';
import { useWorkbenchStore } from '../../store/workbench-store';

/**
 * Drops repo-keyed state that only ever grows once its repo leaves the
 * workspace: `Workbench`'s tabs, and the sidebar's `collapsedRepoSections`.
 *
 * Reconciles against the live repo list rather than hooking whatever mutation
 * closes a repo, for the reason `Workbench` originally gave for its own tabs
 * alone: a repo can also leave without anyone clicking Close — a failed
 * restore, a registry rewrite — and reading the list of record covers both.
 *
 * Mounted once from `Shell` rather than left inside `Workbench`, which only
 * renders while the Changes view is active: a repo closed while looking at
 * the Graph used to keep its tabs and its section folds around, unpruned,
 * until the user happened to visit Changes.
 */
export function usePruneClosedRepos(): void {
  const { data: repos } = useRepos();

  useEffect(() => {
    if (!repos) return;
    const open = new Set(repos.map((repo) => repo.id));

    for (const tab of useWorkbenchStore.getState().tabs) {
      if (!open.has(tab.repoId)) useWorkbenchStore.getState().closeRepoTabs(tab.repoId);
    }
    for (const repoId of Object.keys(useUiStore.getState().collapsedRepoSections)) {
      if (!open.has(repoId)) useUiStore.getState().pruneRepoSections(repoId);
    }
  }, [repos]);
}
