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
    terminalMaximized: false,
    terminalSidebarSide: 'right',
    layout: DEFAULT_LAYOUT,
    graphColumns: DEFAULT_GRAPH_COLUMNS,
    navMode: 'auto',
    collapsedNavSections: [],
    graphRefFilter: [],
    graphAuthorFilter: [],
    graphTheme: 'git-graph',
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
    for (const view of ['files', 'graph', 'changes', 'settings'] as const) {
      expect(viewForPath(pathForView(view))).toBe(view);
    }
  });

  it('falls back to the graph for an unknown path', () => {
    expect(viewForPath('/nope')).toBe('graph');
  });
});

describe('phase 16 store additions', () => {
  beforeEach(reset);

  it('persists the settings page, so reopening Settings lands where you were', () => {
    useUiStore.getState().setSettingsPage('agent');

    const saved = JSON.parse(localStorage.getItem('midnite-git.ui') ?? '{}') as {
      state: Record<string, unknown>;
    };
    expect(saved.state.settingsPage).toBe('agent');
  });

  it('gives the Files view a persisted, merge-filled tree pane', () => {
    // A pre-16 payload has no filesTreeWidth — the merge must refill it from
    // the defaults. Checked before the store is touched, while `current` still
    // carries the default width.
    const merged = useUiStore.persist.getOptions().merge?.(
      { layout: { reposWidth: 300 } },
      useUiStore.getState(),
    ) as { layout: Record<string, number> };
    expect(merged.layout.filesTreeWidth).toBe(DEFAULT_LAYOUT.filesTreeWidth);

    useUiStore.getState().setLayout('filesTreeWidth', 260);
    const saved = JSON.parse(localStorage.getItem('midnite-git.ui') ?? '{}') as {
      state: { layout: Record<string, number> };
    };
    expect(saved.state.layout.filesTreeWidth).toBe(260);
  });

  it('does not persist the active view — a launch starts on the graph', () => {
    useUiStore.getState().setActiveView('files');
    const saved = JSON.parse(localStorage.getItem('midnite-git.ui') ?? '{}') as {
      state: Record<string, unknown>;
    };
    expect(saved.state).not.toHaveProperty('activeView');
  });
});

describe('persistence', () => {
  beforeEach(reset);

  /**
   * The exclusions are the contract, and `terminalOpen` is no longer one of
   * them.
   *
   * It used to be, on the grounds that restoring it would spawn a login shell
   * unasked. Sessions now restore dead — a saved transcript with no process
   * behind it — so there is nothing to spawn, and losing every terminal on each
   * launch was the worse half of the trade. A ref filter still cannot survive a
   * restart: it would present a truncated history as the whole truth.
   */
  it('persists geometry and chrome but nothing session-scoped', () => {
    useUiStore.getState().setLayout('reposWidth', 300);
    useUiStore.getState().setGraphRefFilter(['refs/heads/main']);
    useUiStore.getState().selectCommit('abc123');

    const saved = JSON.parse(localStorage.getItem('midnite-git.ui') ?? '{}') as {
      state: Record<string, unknown>;
    };

    expect(saved.state.layout).toMatchObject({ reposWidth: 300 });
    expect(saved.state).not.toHaveProperty('graphRefFilter');
    expect(saved.state).not.toHaveProperty('selectedCommitSha');
  });

  it('persists the terminal chrome, so a restart reopens what was open', () => {
    useUiStore.getState().setTerminalOpen(true);
    useUiStore.getState().toggleTerminalMaximized();
    useUiStore.getState().setTerminalSidebarSide('left');

    const saved = JSON.parse(localStorage.getItem('midnite-git.ui') ?? '{}') as {
      state: Record<string, unknown>;
    };

    expect(saved.state.terminalOpen).toBe(true);
    expect(saved.state.terminalMaximized).toBe(true);
    expect(saved.state.terminalSidebarSide).toBe('left');
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

describe('phase 14 store additions', () => {
  beforeEach(reset);

  it('persists the graph style but neither filter', () => {
    // The style is a preference; a filter that silently survived a restart
    // would present a dimmed or truncated view as the whole truth.
    useUiStore.getState().setGraphTheme('gitkraken');
    useUiStore.getState().setGraphAuthorFilter(['ada@example.com']);

    const saved = JSON.parse(localStorage.getItem('midnite-git.ui') ?? '{}') as {
      state: Record<string, unknown>;
    };

    expect(saved.state.graphTheme).toBe('gitkraken');
    expect(saved.state).not.toHaveProperty('graphAuthorFilter');
    expect(saved.state).not.toHaveProperty('graphRefFilter');
  });

  it('clears the author filter when the repo changes', () => {
    useUiStore.getState().setGraphAuthorFilter(['ada@example.com']);
    useUiStore.getState().selectRepo('repo-b');
    expect(useUiStore.getState().graphAuthorFilter).toEqual([]);
  });

  it('drops the retired author column width on the v1 to v2 migration', () => {
    const migrate = useUiStore.persist.getOptions().migrate;
    const migrated = migrate?.(
      { graphColumns: { author: 160, date: 112, sha: 64 } },
      1,
    ) as { graphColumns: Record<string, number> };

    expect(migrated.graphColumns).not.toHaveProperty('author');
    expect(migrated.graphColumns.date).toBe(112);
  });

  it('leaves an already-migrated payload alone', () => {
    const migrate = useUiStore.persist.getOptions().migrate;
    const payload = { graphColumns: { branchTag: 200, date: 112, sha: 64 } };
    expect(migrate?.(payload, 2)).toBe(payload);
  });
});
