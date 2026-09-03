import { useQuery } from '@tanstack/react-query';
import { DIFF_DEFAULT_CONTEXT, type FileDiff, type StashPart } from '@midnite/studio-shared';
import { useCallback, useState } from 'react';

import { bridge } from '../../services/bridge';
import { keys } from '../../services/queries';
import { useActiveWorktree } from '../../services/use-status';

/**
 * Diff fetching for both scopes, with the context-expansion state attached.
 *
 * Expanding collapsed context is a refetch at a larger `-U`, so the context
 * value has to live above the query key. It resets whenever the target changes:
 * carrying "show the whole file" from a 12-line change onto the next file the
 * user clicks would silently pull a whole lockfile across the wire.
 */

type Result = {
  diff: FileDiff | undefined;
  isLoading: boolean;
  expandContext: (context: number) => void;
};

/**
 * Context that resets when the target changes — DURING render, not in an effect.
 *
 * An effect runs after render, so the render that first observes the new path
 * still holds the previous target's context and issues a query with it. After a
 * "Show the whole file", clicking the next file would fetch it once at
 * `-U1000000` — the entire file across the wire, then cached under the client's
 * `staleTime: Infinity` — before the reset landed and it refetched at `-U3`.
 * That is the precise outcome this reset exists to prevent, so it cannot be one
 * render late.
 *
 * Storing the key alongside the value is React's documented "adjust state when a
 * prop changes" pattern: the comparison happens in render, and the corrected
 * value is what that same render uses.
 */
function useContextReset(key: string): {
  context: number;
  expandContext: (next: number) => void;
} {
  const [state, setState] = useState({ key, context: DIFF_DEFAULT_CONTEXT });

  const context = state.key === key ? state.context : DIFF_DEFAULT_CONTEXT;
  if (state.key !== key) setState({ key, context: DIFF_DEFAULT_CONTEXT });

  // Monotonic within one target: an expander click must never narrow what is
  // already on screen. Keyed on the current target so a click that races a
  // selection change cannot reopen the previous file's context.
  const expandContext = useCallback(
    (next: number) => {
      setState((current) =>
        current.key === key && next <= current.context ? current : { key, context: next },
      );
    },
    [key],
  );

  return { context, expandContext };
}

/** A path's diff in the worktree or the index. */
export function useFileDiff({
  repoId,
  path,
  staged,
  oldPath,
  worktreePath: explicitWorktree,
}: {
  repoId: string;
  path: string;
  staged: boolean;
  /** `StatusEntry.origPath` — without it a renamed file diffs as wholly new. */
  oldPath?: string | null;
  /**
   * Diff THIS checkout, rather than whichever one is selected.
   *
   * The active-worktree fallback below is right for the Changes panel, which
   * is by definition looking at the selection. It is wrong for anything that
   * addresses a checkout by name — the sidebar can open a full diff of a
   * worktree the user has not selected, and silently reading the store there
   * would show the wrong repository's changes under the right title.
   */
  worktreePath?: string | undefined;
}): Result {
  const active = useActiveWorktree();
  const worktreePath = explicitWorktree ?? active.worktreePath;
  const { context, expandContext } = useContextReset(
    [repoId, worktreePath ?? 'main', path, String(staged)].join(' '),
  );

  const { data, isLoading } = useQuery({
    queryKey: keys.diff(repoId, worktreePath, path, staged, context),
    queryFn: async () =>
      bridge()?.status.fileDiff({
        repoId,
        path,
        staged,
        context,
        ...(oldPath ? { oldPath } : {}),
        ...(worktreePath ? { worktreePath } : {}),
      }),
  });

  return { diff: data, isLoading, expandContext };
}

/** A path's diff inside a commit. */
export function useCommitFileDiff({
  repoId,
  sha,
  path,
  oldPath,
}: {
  repoId: string;
  sha: string;
  path: string | null;
  oldPath?: string | null;
}): Result {
  const { worktreePath } = useActiveWorktree();
  const { context, expandContext } = useContextReset([repoId, sha, path ?? ''].join(' '));

  const { data, isLoading } = useQuery({
    queryKey: keys.commitDiff(repoId, sha, path ?? '', context),
    enabled: path !== null,
    queryFn: async () =>
      path === null
        ? undefined
        : bridge()?.status.commitFileDiff({
            repoId,
            sha,
            path,
            context,
            ...(oldPath ? { oldPath } : {}),
            ...(worktreePath ? { worktreePath } : {}),
          }),
    // A commit is immutable — but only at the context it was fetched with, and
    // that is already part of the key.
    staleTime: Number.POSITIVE_INFINITY,
  });

  return { diff: data, isLoading: path !== null && isLoading, expandContext };
}

/** A path's diff within one part of a stash entry (Phase 22 Theme D). */
export function useStashFileDiff({
  repoId,
  selector,
  part,
  path,
  oldPath,
}: {
  repoId: string;
  selector: string;
  part: StashPart;
  path: string | null;
  oldPath?: string | null;
}): Result {
  const { context, expandContext } = useContextReset([repoId, selector, part, path ?? ''].join(' '));

  const { data, isLoading } = useQuery({
    queryKey: keys.stashDiff(repoId, selector, part, path ?? '', context),
    enabled: path !== null,
    queryFn: async () =>
      path === null
        ? undefined
        : ((await bridge()?.stash.diff({
            repoId,
            selector,
            part,
            path,
            context,
            ...(oldPath ? { oldPath } : {}),
          })) ?? undefined),
  });

  return { diff: data, isLoading: path !== null && isLoading, expandContext };
}
