import { useEffect } from 'react';

import { useRepos } from '../../services/queries';
import { useApiClientStore } from '../../store/api-client-store';
import { useUiStore } from '../../store/ui-store';

/**
 * Drops repo-keyed state that only ever grows once its repo leaves the
 * workspace: the API Client's own request tabs (Phase 66 Theme C —
 * `closeRepoTabs` there additionally aborts any in-flight send for the
 * closed repo), and the sidebar's `collapsedRepoSections`. (The Database
 * view's query tabs are not repo-scoped, so they are not pruned here.)
 *
 * Reconciles against the live repo list rather than hooking whatever mutation
 * closes a repo: a repo can also leave without anyone clicking Close — a failed
 * restore, a registry rewrite — and reading the list of record covers both.
 *
 * Mounted once from `Shell`, so it runs whichever view is on screen.
 */
export function usePruneClosedRepos(): void {
  const { data: repos } = useRepos();

  useEffect(() => {
    if (!repos) return;
    const open = new Set(repos.map((repo) => repo.id));

    for (const tab of useApiClientStore.getState().tabs) {
      if (!open.has(tab.repoId)) useApiClientStore.getState().closeRepoTabs(tab.repoId);
    }
    for (const repoId of Object.keys(useUiStore.getState().collapsedRepoSections)) {
      if (!open.has(repoId)) useUiStore.getState().pruneRepoSections(repoId);
    }
    const currentSelected = useUiStore.getState().selectedRepoId;
    if (currentSelected && !open.has(currentSelected)) {
      useUiStore.getState().selectRepo(null);
    }
  }, [repos]);
}
