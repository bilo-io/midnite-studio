/**
 * The fs browse scope and its query-key prefix, split out of `file-tree.tsx`
 * so `use-file-actions.ts` can depend on it without the two files importing
 * each other. Re-exported from `file-tree.tsx` for every existing caller.
 */
export type FsScopeInput =
  | { scope: 'repo'; repoId: string; worktreePath?: string }
  | { scope: 'claude-home' };

/** Stable query-key prefix for one scope — also what a refresh invalidates. */
export const fsScopeKey = (scope: FsScopeInput): readonly unknown[] =>
  scope.scope === 'repo'
    ? (['fs', 'repo', scope.repoId, scope.worktreePath ?? null] as const)
    : (['fs', 'claude-home'] as const);
