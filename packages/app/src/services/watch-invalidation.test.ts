import type { WatchKind } from '@midnite-git/shared';
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
  it('refresh status only', () => {
    for (const kind of ['worktree', 'index'] as const) {
      invalidated = [];
      const result = run(kind);

      expect(invalidated).toHaveLength(1);
      expect(invalidated[0]?.slice(0, 3)).toEqual(['repos', 'repo-1', 'status']);
      expect(result.restreamGraph).toBe(false);
    }
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

    expect(invalidated).toEqual([['repos', 'repo-1']]);
    expect(result.restreamGraph).toBe(true);
  });
});
