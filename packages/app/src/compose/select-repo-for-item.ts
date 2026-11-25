import type { RepoDescriptor } from '@midnite/studio-shared';

import { keys } from '../services/queries';
import { appQueryClient } from '../services/query-client';
import { useUiStore } from '../store/ui-store';

export type SelectRepoTarget = {
  repoId?: string | null;
  cwd?: string | null;
};

function normalizePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const slashed = trimmed.replaceAll('\\', '/');
  return slashed.length > 1 ? slashed.replace(/\/+$/, '') || '/' : slashed;
}

function isPathWithinRoot(cwd: string, root: string): boolean {
  if (!root) return false;
  if (cwd === root) return true;
  return root === '/' ? cwd.startsWith('/') : cwd.startsWith(`${root}/`);
}

/**
 * Resolves the best matching registered repository for a session or chat.
 *
 * Prefers a path-boundary match on `cwd` against registered repository roots
 * and worktrees (picking the longest matching root so nested or `cd`d checkouts
 * resolve to the right repo), falling back to an exact `repoId` match.
 */
export function resolveRepoForTarget(
  target: SelectRepoTarget,
  repos: readonly RepoDescriptor[] | undefined,
): RepoDescriptor | null {
  if (!repos?.length) return null;

  const normalizedCwd = target.cwd ? normalizePath(target.cwd) : '';
  if (normalizedCwd) {
    let bestRepo: RepoDescriptor | null = null;
    let bestRootLength = -1;

    for (const repo of repos) {
      const roots = [repo.path, ...(repo.worktrees?.map((w) => w.path) ?? [])];
      for (const rawRoot of roots) {
        const root = normalizePath(rawRoot);
        if (!isPathWithinRoot(normalizedCwd, root)) continue;
        if (root.length > bestRootLength) {
          bestRepo = repo;
          bestRootLength = root.length;
        }
      }
    }

    if (bestRepo) return bestRepo;
  }

  if (target.repoId) {
    return repos.find((repo) => repo.id === target.repoId) ?? null;
  }

  return null;
}

/**
 * Switches Midnite Studio's selected repository to the registered repo matching
 * a clicked session or chat, if one is found and not already selected.
 */
export function selectRepoForSessionOrChat(
  target: SelectRepoTarget,
  repos?: readonly RepoDescriptor[],
): void {
  const registeredRepos = repos ?? appQueryClient.getQueryData<RepoDescriptor[]>(keys.repos);
  const matched = resolveRepoForTarget(target, registeredRepos);
  if (!matched) return;

  const ui = useUiStore.getState();
  if (ui.selectedRepoId !== matched.id) {
    ui.selectRepo(matched.id);
  }
}
