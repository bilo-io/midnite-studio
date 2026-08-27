import { useEffect } from 'react';

import type { WatchKind } from '@midnite/git-shared';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import { useGraphStore } from '../features/graph/graph-store';
import { bridge } from './bridge';
import { keys } from './queries';

/**
 * Map a watch event to the narrowest refresh that can be correct.
 *
 * The temptation is to invalidate everything on every event; the reason not to
 * is the graph. Re-streaming 50 000 rows because a file was saved would make
 * the app stutter every few keystrokes in an editor, and the graph would flash
 * empty each time. So:
 *
 *   worktree  a tracked file changed on disk        → status only
 *   index     something was staged/unstaged         → status only
 *   refs      branches/tags moved                   → refs + status + re-stream
 *   head      a checkout happened                   → everything + re-stream
 *
 * The split that matters is between `worktree`/`index` and the ref kinds. File
 * saves and staging are constant — an editor autosaving fires them every few
 * seconds — and re-streaming 50,000 rows for each would make the app stutter
 * continuously and flash the graph empty. Neither can change history, so
 * neither needs to.
 *
 * `refs` DOES re-stream, and an earlier version of this map got that wrong on a
 * plausible-sounding argument: badges join rows by sha, so surely a ref moving
 * only needs the badge refreshed? That holds only when the ref moves to a
 * commit already in the graph. The commonest ref event by far is a commit —
 * which advances a branch tip to a commit that is not in the streamed rows at
 * all, so the graph simply never showed it. Caught by committing from the
 * integrated terminal and watching nothing happen.
 */
export function invalidateForWatchKind(
  client: QueryClient,
  repoId: string,
  kind: WatchKind,
): { restreamGraph: boolean } {
  switch (kind) {
    case 'worktree':
    case 'index':
      void client.invalidateQueries({ queryKey: keys.status(repoId), exact: false });
      return { restreamGraph: false };

    case 'refs':
      void client.invalidateQueries({ queryKey: keys.refs(repoId) });
      void client.invalidateQueries({ queryKey: keys.status(repoId), exact: false });
      // Statistics are an `--all` traversal, so every figure in the dashboard
      // depends on the ref set: a commit or a fetch changes the contributor
      // table and the calendar. Main's own cache is keyed on a digest of the
      // ref tips and would miss anyway; this is what makes the widgets refetch
      // rather than sit on a correct-but-old answer until something else moves.
      void client.invalidateQueries({ queryKey: keys.stats(repoId), exact: false });
      return { restreamGraph: true };

    case 'head':
      // A checkout changes the branch, the working tree, the ahead/behind
      // counts and potentially the set of reachable commits.
      void client.invalidateQueries({ queryKey: keys.repo(repoId) });
      // And the repo LIST, which is where the worktree rows actually come from.
      //
      // `keys.repo(id)` is `['repos', id]`; the list is `['repos']`. Prefix
      // matching runs one way only — invalidating the list catches the repo,
      // but invalidating the repo never catches the list. The panel renders
      // `repo.worktrees` off `useRepos()`, so with `staleTime: Infinity` the
      // worktree rows could not refresh for the life of the process: a
      // `worktree add`/`remove`/`prune` run in a terminal left the old rows on
      // screen — including a pruned one still badged "detached missing" —
      // until the app was restarted.
      void client.invalidateQueries({ queryKey: keys.repos });
      return { restreamGraph: true };

    default:
      return { restreamGraph: false };
  }
}

/**
 * Subscribe once and route every watch event through the map above.
 *
 * Mounted at the app root rather than per-feature: the events are per
 * repository, not per view, and a status refresh has to happen whether or not
 * the changes panel is currently on screen.
 */
export function useWatchInvalidation(selectedRepoId: string | null): void {
  const client = useQueryClient();

  useEffect(() => {
    const api = bridge();
    if (!api) return;

    return api.watch.onEvent((event) => {
      const { restreamGraph } = invalidateForWatchKind(client, event.repoId, event.kind);

      // Only the repo actually on screen is worth re-streaming; a background
      // repo's graph will be rebuilt when the user switches to it anyway.
      if (restreamGraph && event.repoId === selectedRepoId) {
        useGraphStore.getState().requestRestream();
      }
    });
  }, [client, selectedRepoId]);
}
