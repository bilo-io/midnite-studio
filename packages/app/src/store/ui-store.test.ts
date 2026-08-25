import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_GRAPH_COLUMNS,
  DEFAULT_LAYOUT,
  pathForView,
  useUiStore,
  viewForPath,
} from './ui-store';

const reset = () =>
  useUiStore.setState({
    activeView: 'graph',
    selectedRepoId: null,
    selectedWorktreePath: null,
    selectedCommitSha: null,
    terminalOpen: false,
    layout: DEFAULT_LAYOUT,
    graphColumns: DEFAULT_GRAPH_COLUMNS,
    navMode: 'auto',
    collapsedNavSections: [],
    graphRefFilter: [],
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

describe('persistence', () => {
  beforeEach(reset);

  /**
   * The exclusions are the contract. Restoring `terminalOpen` would spawn a
   * login shell before the user asked for a terminal, and restoring a ref
   * filter would present a truncated history as the whole truth.
   */
  it('persists geometry and chrome but nothing session-scoped', () => {
    useUiStore.getState().setLayout('reposWidth', 300);
    useUiStore.getState().setTerminalOpen(true);
    useUiStore.getState().setGraphRefFilter(['refs/heads/main']);
    useUiStore.getState().selectCommit('abc123');

    const saved = JSON.parse(localStorage.getItem('midnite-git.ui') ?? '{}') as {
      state: Record<string, unknown>;
    };

    expect(saved.state.layout).toMatchObject({ reposWidth: 300 });
    expect(saved.state).not.toHaveProperty('terminalOpen');
    expect(saved.state).not.toHaveProperty('graphRefFilter');
    expect(saved.state).not.toHaveProperty('selectedCommitSha');
  });

  it('clears the ref filter when the repo changes', () => {
    useUiStore.getState().setGraphRefFilter(['refs/heads/feat-x']);
    useUiStore.getState().selectRepo('repo-b');
    expect(useUiStore.getState().graphRefFilter).toEqual([]);
  });

  it('fills in panes a stored payload predates', () => {
    // A payload written before a pane existed must gain the new key from the
    // defaults, not leave it undefined — `width: undefined` reaches the DOM as
    // a collapsed panel.
    const merged = useUiStore.persist.getOptions().merge?.(
      { layout: { reposWidth: 300 } },
      useUiStore.getState(),
    ) as { layout: Record<string, number> };

    expect(merged.layout.reposWidth).toBe(300);
    expect(merged.layout.terminalHeight).toBe(DEFAULT_LAYOUT.terminalHeight);
  });
});
