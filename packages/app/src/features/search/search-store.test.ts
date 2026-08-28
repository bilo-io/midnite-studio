import { beforeEach, describe, expect, it } from 'vitest';
import { useSearchStore } from './search-store';

describe('useSearchStore', () => {
  beforeEach(() => {
    useSearchStore.getState().resetResults();
  });

  it('updates mode and resets results on mode change', () => {
    const store = useSearchStore.getState();
    store.startSearch('req-1', 'commits');
    store.appendCommits('req-1', [
      {
        sha: 'abc1234567890123456789012345678901234567',
        parents: [],
        subject: 'feat: something',
        authorName: 'Alice',
        authorEmail: 'alice@example.com',
        authorDate: 1700000000,
        committerDate: 1700000000,
        refs: [],
      },
    ]);


    expect(useSearchStore.getState().commitsResults).toHaveLength(1);


    useSearchStore.getState().setMode('content');
    expect(useSearchStore.getState().mode).toBe('content');
    expect(useSearchStore.getState().commitsResults).toHaveLength(0);
  });

  it('handles search start, batch append, and finish', () => {
    const store = useSearchStore.getState();
    store.startSearch('req-123', 'content');

    expect(useSearchStore.getState().inFlight?.requestId).toBe('req-123');

    store.appendContentHits('req-123', [
      { path: 'src/index.ts', line: 10, kind: 'match', text: 'export const foo = 1;' },
    ]);

    expect(useSearchStore.getState().contentResults).toHaveLength(1);
    expect(useSearchStore.getState().totalResults).toBe(1);

    store.finishSearch('req-123', 1, false);
    expect(useSearchStore.getState().inFlight).toBeNull();
    expect(useSearchStore.getState().totalResults).toBe(1);
  });
});
