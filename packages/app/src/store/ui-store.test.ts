import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_AGENT_SKILLS,
  DEFAULT_GRAPH_COLUMNS,
  DEFAULT_LAYOUT,
  pathForView,
  SETTINGS_GROUPS,
  SETTINGS_PAGES,
  useUiStore,
  viewForPath,
  VIEW_IDS,
} from './ui-store';

const reset = () =>
  useUiStore.setState({
    activeView: 'graph',
    selectedRepoId: null,
    selectedWorktreePath: null,
    selectedCommitSha: null,
    reposOpen: true,
    terminalOpen: false,
    terminalMaximized: false,
    terminalSidebarSide: 'right',
    layout: DEFAULT_LAYOUT,
    graphColumns: DEFAULT_GRAPH_COLUMNS,
    navMode: 'auto',
    collapsedNavSections: [],
    collapsedSettingsGroups: [],
    sectionFilters: {},
    graphRefFilter: [],
    graphAuthorFilter: [],
    graphTheme: 'git-graph',
    agentSkills: DEFAULT_AGENT_SKILLS,
    primaryAgent: 'claude',
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

  // Open by default, unlike the terminal: it is the app's primary object list,
  // so the toggle's first press must HIDE it rather than reveal it.
  it('toggles the repositories sidebar, starting from shown', () => {
    expect(useUiStore.getState().reposOpen).toBe(true);
    useUiStore.getState().toggleRepos();
    expect(useUiStore.getState().reposOpen).toBe(false);
    useUiStore.getState().toggleRepos();
    expect(useUiStore.getState().reposOpen).toBe(true);
  });
});

describe('view paths', () => {
  it('round-trips every view', () => {
    // Derived from VIEW_IDS rather than a literal list: the round-trip is only
    // worth asserting if it cannot be true for four views and untested for the
    // three that were added later.
    for (const view of VIEW_IDS) {
      expect(viewForPath(pathForView(view))).toBe(view);
    }
  });

  it('falls back to the graph for an unknown path', () => {
    expect(viewForPath('/nope')).toBe('graph');
  });

  it('gives the three Phase 19 views paths of their own', () => {
    // Their own, and distinct: the chain this replaced answered `graph` for
    // anything it had not been taught, which for three new views would have
    // meant three rail links that all looked like the graph.
    expect(viewForPath('/dashboard')).toBe('dashboard');
    expect(viewForPath('/actions')).toBe('actions');
    expect(viewForPath('/tests')).toBe('tests');
  });
});

describe('phase 19 store additions', () => {
  beforeEach(reset);

  it('starts every view on its own default — no entry means "whatever this view does"', () => {
    expect(useUiStore.getState().sectionFilters).toEqual({});
  });

  it('keeps each view\'s sidebar narrowing separate', () => {
    // Filtering Actions down to its two sections and wanting the whole tree in
    // Changes are unrelated decisions; one flag for both would make each undo
    // the other.
    useUiStore.getState().setSectionFilter('actions', false);
    useUiStore.getState().setSectionFilter('changes', true);

    expect(useUiStore.getState().sectionFilters).toEqual({
      actions: false,
      changes: true,
    });
  });

  it('persists the narrowing, like the sections a user folded away', () => {
    useUiStore.getState().setSectionFilter('actions', false);

    const saved = JSON.parse(localStorage.getItem('midnite-git.ui') ?? '{}') as {
      state: { sectionFilters: Record<string, boolean> };
    };
    expect(saved.state.sectionFilters).toEqual({ actions: false });
  });

  it('resets every override at once, back to the sparse map', () => {
    // `{}`, not each view's default written out: an absent entry keeps meaning
    // "whatever this view does", so a default that changes later still applies.
    useUiStore.getState().setSectionFilter('actions', false);
    useUiStore.getState().setSectionFilter('changes', true);

    useUiStore.getState().resetSectionFilters();

    expect(useUiStore.getState().sectionFilters).toEqual({});
  });

  it('fills in views a stored payload predates', () => {
    // A payload written before a view existed must not replace the whole map
    // and leave the newer views without their defaults.
    const merged = useUiStore.persist.getOptions().merge?.(
      { sectionFilters: { changes: false } },
      useUiStore.getState(),
    ) as { sectionFilters: Record<string, boolean> };

    expect(merged.sectionFilters).toEqual({ changes: false });
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

  it('persists a hidden repositories sidebar, so it stays hidden across a restart', () => {
    useUiStore.getState().setReposOpen(false);

    const saved = JSON.parse(localStorage.getItem('midnite-git.ui') ?? '{}') as {
      state: Record<string, unknown>;
    };

    expect(saved.state.reposOpen).toBe(false);
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


describe('grouped settings navigation', () => {
  beforeEach(reset);

  it('files every page into a group that exists', () => {
    // The sidebar renders group-first — `SETTINGS_PAGES.filter(by group)` — so a
    // page carrying a group id no header declares renders nowhere at all, and
    // does so silently. There is no runtime check for it; this is the check.
    const groups = new Set(SETTINGS_GROUPS.map((group) => group.id));
    for (const page of SETTINGS_PAGES) {
      expect(groups, `page "${page.id}"`).toContain(page.group);
    }
  });

  it('gives every group at least one page', () => {
    // The other direction: the view skips an empty group rather than drawing a
    // header over nothing, so an empty one is dead weight, not a broken screen.
    for (const group of SETTINGS_GROUPS) {
      expect(
        SETTINGS_PAGES.filter((page) => page.group === group.id),
        `group "${group.id}"`,
      ).not.toHaveLength(0);
    }
  });

  it('toggles a settings group shut and open again', () => {
    useUiStore.getState().toggleSettingsGroup('tools');
    expect(useUiStore.getState().collapsedSettingsGroups).toEqual(['tools']);

    useUiStore.getState().toggleSettingsGroup('tools');
    expect(useUiStore.getState().collapsedSettingsGroups).toEqual([]);
  });

  it('collapses groups independently', () => {
    useUiStore.getState().toggleSettingsGroup('tools');
    useUiStore.getState().toggleSettingsGroup('system');
    useUiStore.getState().toggleSettingsGroup('tools');

    expect(useUiStore.getState().collapsedSettingsGroups).toEqual(['system']);
  });

  it('persists which groups are folded shut', () => {
    // Arranged chrome, like `collapsedNavSections`: a user who folded Tools away
    // should not have to fold it away again on every launch.
    useUiStore.getState().toggleSettingsGroup('system');

    const saved = JSON.parse(localStorage.getItem('midnite-git.ui') ?? '{}') as {
      state: Record<string, unknown>;
    };
    expect(saved.state.collapsedSettingsGroups).toEqual(['system']);
  });

  it('starts a group added after the stored payload was written open', () => {
    // Storing only the collapsed ones is what buys this: a payload predating a
    // group says nothing about it, and saying nothing means open.
    const merged = useUiStore.persist.getOptions().merge?.(
      { collapsedSettingsGroups: ['tools'] },
      useUiStore.getState(),
    ) as { collapsedSettingsGroups: string[] };

    expect(merged.collapsedSettingsGroups).toEqual(['tools']);
    expect(merged.collapsedSettingsGroups).not.toContain('general');
  });
});

describe('the nav-mode lock', () => {
  beforeEach(reset);

  it('moves between all three modes', () => {
    // Three, not two: the rail's own chevron is a deliberate two-state pin
    // (`auto` ⇄ `expanded`), and the Appearance control is the only route to
    // `collapsed`. The store has to carry all three regardless of which
    // control is driving.
    expect(useUiStore.getState().navMode).toBe('auto');

    useUiStore.getState().setNavMode('expanded');
    expect(useUiStore.getState().navMode).toBe('expanded');

    useUiStore.getState().setNavMode('collapsed');
    expect(useUiStore.getState().navMode).toBe('collapsed');

    useUiStore.getState().setNavMode('auto');
    expect(useUiStore.getState().navMode).toBe('auto');
  });

  it('persists the mode, so a locked rail is still locked next launch', () => {
    // The whole point of a lock is that it outlives the session that set it —
    // a pin the app forgets is a hover preference with extra steps. `navMode`
    // is in `partialize` for exactly this, and nothing else asserted it.
    useUiStore.getState().setNavMode('expanded');

    const saved = JSON.parse(localStorage.getItem('midnite-git.ui') ?? '{}') as {
      state: Record<string, unknown>;
    };
    expect(saved.state.navMode).toBe('expanded');
  });

  it('leaves a payload that predates the setting on auto', () => {
    // The failure this guards is not a crash but a launch: booting into a rail
    // locked open — or worse, locked shut — that the user never asked for,
    // because the merge left the field undefined and `AppFrame` fell back to
    // something other than the store's own default.
    const merged = useUiStore.persist.getOptions().merge?.(
      { collapsedNavSections: ['workspace'] },
      useUiStore.getState(),
    ) as { navMode: string };

    expect(merged.navMode).toBe('auto');
  });
});

describe('the midnite menu\'s skills', () => {
  beforeEach(reset);

  it('points each entry at a default that Settings can move', () => {
    expect(useUiStore.getState().agentSkills.execBacklog).toBe('/midnite-exec');

    useUiStore.getState().setAgentSkill('execBacklog', '/midnite-address-issue');

    // One entry moves; the other four are untouched.
    expect(useUiStore.getState().agentSkills).toEqual({
      ...DEFAULT_AGENT_SKILLS,
      execBacklog: '/midnite-address-issue',
    });
  });

  it('persists the whole record, so a launch reads back what was configured', () => {
    useUiStore.getState().setAgentSkill('brainstorm', '/midnite-brainstorm --wide');

    const saved = JSON.parse(localStorage.getItem('midnite-git.ui') ?? '{}') as {
      state: Record<string, unknown>;
    };
    expect(saved.state.agentSkills).toEqual({
      ...DEFAULT_AGENT_SKILLS,
      brainstorm: '/midnite-brainstorm --wide',
    });
  });

  it('fills an entry the stored payload predates, rather than leaving it undefined', () => {
    /*
      The reason `merge` re-spreads this record. zustand's default shallow merge
      would replace the whole object with the stored one, and a payload written
      before a later entry existed carries no key for it — which reaches the
      shell as `claude 'undefined'`, a prompt rather than a crash.
    */
    const merged = useUiStore.persist.getOptions().merge?.(
      { agentSkills: { execBacklog: '/midnite-address-issue' } },
      useUiStore.getState(),
    ) as { agentSkills: Record<string, string> };

    expect(merged.agentSkills.execBacklog).toBe('/midnite-address-issue');
    expect(merged.agentSkills.loopPrFeedback).toBe(DEFAULT_AGENT_SKILLS.loopPrFeedback);
  });
});

describe('the primary agent', () => {
  beforeEach(reset);

  it('defaults to claude, and Settings can move it', () => {
    expect(useUiStore.getState().primaryAgent).toBe('claude');

    useUiStore.getState().setPrimaryAgent('codex');

    expect(useUiStore.getState().primaryAgent).toBe('codex');
  });

  it('persists across a reload', () => {
    useUiStore.getState().setPrimaryAgent('agy');

    const saved = JSON.parse(localStorage.getItem('midnite-git.ui') ?? '{}') as {
      state: Record<string, unknown>;
    };
    expect(saved.state.primaryAgent).toBe('agy');
  });

  it('falls back to the default when the stored payload predates the field', () => {
    const merged = useUiStore.persist.getOptions().merge?.({}, useUiStore.getState()) as {
      primaryAgent: string;
    };

    expect(merged.primaryAgent).toBe('claude');
  });
});
