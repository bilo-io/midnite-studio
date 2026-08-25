import { beforeEach, describe, expect, it } from 'vitest';

import { pathForView, useUiStore, viewForPath } from './ui-store';

const reset = () =>
  useUiStore.setState({
    activeView: 'graph',
    selectedRepoId: null,
    selectedWorktreePath: null,
    selectedCommitSha: null,
    terminalOpen: false,
  });

describe('useUiStore', () => {
  beforeEach(reset);

  it('clears worktree and commit selection when the repo changes', () => {
    // Both are scoped to a repo; carrying them across would show the new repo's
    // graph with the old repo's commit selected — and every lookup by sha would
    // miss.
    const store = useUiStore.getState();
    store.selectRepo('repo-a');
    useUiStore.getState().selectWorktree('/a/wt');
    useUiStore.getState().selectCommit('abc');

    useUiStore.getState().selectRepo('repo-b');

    expect(useUiStore.getState()).toMatchObject({
      selectedRepoId: 'repo-b',
      selectedWorktreePath: null,
      selectedCommitSha: null,
    });
  });

  it('toggles the terminal', () => {
    useUiStore.getState().toggleTerminal();
    expect(useUiStore.getState().terminalOpen).toBe(true);
    useUiStore.getState().toggleTerminal();
    expect(useUiStore.getState().terminalOpen).toBe(false);
  });
});

describe('view paths', () => {
  it('round-trips every view', () => {
    for (const view of ['graph', 'changes', 'settings'] as const) {
      expect(viewForPath(pathForView(view))).toBe(view);
    }
  });

  it('falls back to the graph for an unknown path', () => {
    expect(viewForPath('/nope')).toBe('graph');
  });
});
