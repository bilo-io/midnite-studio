// Test support for the frame's own graph and diff tests: the smallest READ-ONLY `GitHost` — no actions,
// no agents, no working-copy or stash panels — i.e. what a composer other than Studio gives the views.
import { useState, type ReactElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, type RenderOptions } from '@testing-library/react';
import { LuBot } from 'react-icons/lu';
import { createStore, useStore, type StoreApi } from 'zustand';

import type { Ref, StatusResult } from '@midnite/studio-shared';

import { FrameChromeProvider } from '../chrome/chrome-port';
import { createFrameChrome } from '../kit/frame-chrome';
import { DEFAULT_GRAPH_COLUMN_VISIBILITY, withColumnVisible } from './column-visibility';
import { GitHostProvider, type GitHost } from './git-host';
import { DEFAULT_GRAPH_COLUMNS, type GitUiState } from './graph-ui-state';
import { DEFAULT_GRAPH_DENSITY, DEFAULT_GRAPH_THEME } from './graph-themes';
import { DEFAULT_PROVENANCE_MARK_MODE } from './provenance-display';

export function createTestGitUi(initial: Partial<GitUiState> = {}): StoreApi<GitUiState> {
  return createStore<GitUiState>()((set) => ({
    selectedRepoId: null,
    selectedWorktreePath: null,
    graphSelection: null,
    selectCommit: (sha) => set({ graphSelection: sha === null ? null : { kind: 'commit', sha } }),
    selectWorkingTree: (open) => set({ graphSelection: open ? { kind: 'working-tree' } : null }),
    selectStash: (selector) => set({ graphSelection: selector === null ? null : { kind: 'stash', selector } }),
    selectConflict: (path) => set({ graphSelection: path === null ? null : { kind: 'conflict', path } }),
    graphWorkingCopyReveal: 0,
    layout: { detailWidth: 384, graphInlineHeight: 440 },
    setLayout: (key, value) => set((s) => ({ layout: { ...s.layout, [key]: value } })),
    graphColumns: DEFAULT_GRAPH_COLUMNS,
    setGraphColumn: (key, value) => set((s) => ({ graphColumns: { ...s.graphColumns, [key]: value } })),
    graphColumnVisibility: DEFAULT_GRAPH_COLUMN_VISIBILITY,
    setGraphColumnVisible: (column, visible) =>
      set((s) => ({ graphColumnVisibility: withColumnVisible(s.graphColumnVisibility, column, visible) })),
    graphTheme: DEFAULT_GRAPH_THEME,
    graphDensity: DEFAULT_GRAPH_DENSITY,
    graphProvenanceMark: DEFAULT_PROVENANCE_MARK_MODE,
    graphShowCi: false,
    setGraphShowCi: (graphShowCi) => set({ graphShowCi }),
    graphRefFilter: [],
    setGraphRefFilter: (graphRefFilter) => set({ graphRefFilter }),
    graphAuthorFilter: [],
    setGraphAuthorFilter: (graphAuthorFilter) => set({ graphAuthorFilter }),
    graphSessionFilter: null,
    setGraphSessionFilter: (graphSessionFilter) => set({ graphSessionFilter }),
    graphShaFilter: null,
    setGraphShaFilter: (graphShaFilter) => set({ graphShaFilter }),
    graphProvenanceFilter: 'all',
    setGraphProvenanceFilter: (graphProvenanceFilter) => set({ graphProvenanceFilter }),
    diffLayout: 'unified',
    toggleDiffLayout: () => set((s) => ({ diffLayout: s.diffLayout === 'split' ? 'unified' : 'split' })),
    diffShowOldGutter: false,
    toggleDiffOldGutter: () => set((s) => ({ diffShowOldGutter: !s.diffShowOldGutter })),
    ...initial,
  }));
}

/** What the fake data hooks answer; a test assigns to it before rendering. */
export const testGitData: { refs: Ref[]; status: StatusResult | undefined } = { refs: [], status: undefined };

const BOUNDS = { detailWidth: { min: 280, max: 720, initial: 384 }, graphInlineHeight: { min: 200, max: 1200, initial: 440 } };

export function makeTestGitHost(ui: StoreApi<GitUiState>, overrides: Partial<GitHost> = {}): GitHost {
  return {
    useUi: (selector) => useStore(ui, selector),
    getUi: ui.getState,
    useGraphVisible: () => true,
    panelBounds: BOUNDS,
    queryKeys: {
      diff: (...args) => ['diff', ...args],
      commitDiff: (...args) => ['commit-diff', ...args],
      stashDiff: (...args) => ['stash-diff', ...args],
      commitStats: (...args) => ['commit-stats', ...args],
      forgeCommitRuns: (...args) => ['forge-commit-runs', ...args],
    },
    useActiveWorktree: () => ({ repoId: useStore(ui, (s) => s.selectedRepoId) }),
    useStatus: () => ({ data: testGitData.status }),
    useRefs: () => ({ data: testGitData.refs }),
    useDismiss: () => undefined,
    useCascadeReveal: () => ({ active: false, styleFor: () => ({}) }),
    useRevealCount: () => 0,
    resolveAgentIcon: () => LuBot,
    Tooltip: ({ children }) => children,
    MultiSelectMenu: ({ label, allLabel }) => (
      <button type="button" aria-label={label}>
        {allLabel}
      </button>
    ),
    UserAvatar: ({ name }) => <span data-testid="test-avatar">{name}</span>,
    CommitPanel: ({ sha }) => <div data-testid="test-commit-panel">{sha}</div>,
    ...overrides,
  };
}

const { chrome: TEST_CHROME } = createFrameChrome();

export function GitTestProviders({ host, children }: { host: GitHost; children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return (
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={TEST_CHROME}>
        <GitHostProvider host={host}>{children}</GitHostProvider>
      </FrameChromeProvider>
    </QueryClientProvider>
  );
}

/** `render` with the frame chrome and a read-only test host installed. */
export function renderWithGitHost(ui: ReactElement, host: GitHost, options: RenderOptions = {}) {
  return rtlRender(ui, { wrapper: ({ children }) => <GitTestProviders host={host}>{children}</GitTestProviders>, ...options });
}
