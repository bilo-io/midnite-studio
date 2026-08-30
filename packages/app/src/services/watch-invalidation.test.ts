import type { WatchKind } from '@midnite/studio-shared';
import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { invalidateForWatchKind } from './watch-invalidation';

/**
 * The point of classifying watch events is to invalidate *narrowly*. These
 * assert exactly which query keys each kind touches, because the failure mode
 * of getting it wrong is invisible: too broad and the app just feels slow and
 * flickery, too narrow and it shows stale data.
 */
let client: QueryClient;
let invalidated: unknown[][];

beforeEach(() => {
  client = new QueryClient();
  invalidated = [];
  vi.spyOn(client, 'invalidateQueries').mockImplementation(async (filters) => {
    invalidated.push((filters as { queryKey: unknown[] }).queryKey);
  });
});

const run = (kind: WatchKind) => invalidateForWatchKind(client, 'repo-1', kind);

describe('worktree and index changes', () => {
  it('index changes refresh status only', () => {
    const result = run('index');

    expect(invalidated).toHaveLength(1);
    expect(invalidated[0]?.slice(0, 3)).toEqual(['repos', 'repo-1', 'status']);
    expect(result.restreamGraph).toBe(false);
  });

  it('worktree changes refresh status AND the fs cache (Phase 24)', () => {
    // A tracked file can change on disk from outside the app (an external
    // editor, `mv` in the integrated terminal) or from the Files view's own
    // writes — either way the tree and preview have to catch up without a
    // manual refresh.
    const result = run('worktree');

    expect(invalidated).toContainEqual(['repos', 'repo-1', 'status', 'main']);
    expect(invalidated).toContainEqual(['fs', 'repo', 'repo-1']);
    expect(result.restreamGraph).toBe(false);
  });

  it('never re-stream the graph', () => {
    // Re-streaming 50,000 rows because a file was saved would make the app
    // stutter on every keystroke in an editor.
    expect(run('worktree').restreamGraph).toBe(false);
  });
});

describe('ref changes', () => {
  it('refresh refs and status AND re-stream the graph', () => {
    // A ref moving is usually a commit, which advances a branch tip to a commit
    // that is not in the streamed rows at all. Refreshing only the badges — the
    // first version of this map — meant a commit made in the integrated
    // terminal never appeared in the graph.
    const result = run('refs');

    expect(invalidated).toContainEqual(['repos', 'repo-1', 'refs']);
    expect(result.restreamGraph).toBe(true);
  });
});

describe('the cheap/expensive split', () => {
  it('only file-level events avoid a re-stream', () => {
    // The whole point of classifying: an editor autosaving fires `worktree`
    // every few seconds, and re-streaming 50,000 rows each time would make the
    // app stutter continuously.
    expect(run('worktree').restreamGraph).toBe(false);
    expect(run('index').restreamGraph).toBe(false);
    expect(run('refs').restreamGraph).toBe(true);
    expect(run('head').restreamGraph).toBe(true);
  });
});

describe('HEAD changes', () => {
  it('invalidate the whole repo and re-stream', () => {
    // A checkout can change which commits are reachable at all, so the graph
    // genuinely has to be rebuilt.
    const result = run('head');

    expect(invalidated).toContainEqual(['repos', 'repo-1']);
    expect(result.restreamGraph).toBe(true);
  });

  it('invalidate the repo LIST too, which is what holds the worktree rows', () => {
    // Prefix matching runs one way only. `['repos', 'repo-1']` does not match
    // the list's `['repos']`, so invalidating the repo alone never refetched
    // it — and the panel reads its worktree rows from `useRepos()`, under
    // `staleTime: Infinity`. A `worktree add`/`remove`/`prune` run outside the
    // app therefore could not reach the UI at all: the rows sat unchanged for
    // the life of the process, a pruned worktree still listed and badged
    // "detached missing", until the app was restarted.
    run('head');

    expect(invalidated).toContainEqual(['repos']);
  });
});
