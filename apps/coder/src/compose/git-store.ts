import { useStore } from 'zustand';

import {
  createPersistedStore,
  DEFAULT_GRAPH_COLUMN_VISIBILITY,
  DEFAULT_GRAPH_COLUMNS,
  DEFAULT_GRAPH_DENSITY,
  DEFAULT_GRAPH_THEME,
  DEFAULT_PROVENANCE_MARK_MODE,
  normalizeColumnVisibility,
  withColumnVisible,
  type GitUiState,
} from '@midnite/studio-frame';

import { coderStore } from '../coder-store';

/**
 * The git graph's and diff's state in Coder — the frame's `GitUiState`, in its own store.
 *
 * The preferences (style, density, columns and their widths, the CI column, the diff layout) persist
 * under `midnite-coder.git`; the selection and the filters are per session, as in Studio. The
 * repository is Coder's own selection, mirrored in from `coderStore` — switching repository closes
 * whatever commit was open, so a panel never shows one repository's sha under another's graph.
 */
type Persisted = Pick<
  GitUiState,
  'layout' | 'graphColumns' | 'graphColumnVisibility' | 'graphTheme' | 'graphDensity' | 'graphProvenanceMark' | 'graphShowCi' | 'diffLayout' | 'diffShowOldGutter'
>;

const DEFAULTS: Persisted = {
  layout: { detailWidth: 384, graphInlineHeight: 440 },
  graphColumns: DEFAULT_GRAPH_COLUMNS,
  graphColumnVisibility: DEFAULT_GRAPH_COLUMN_VISIBILITY,
  graphTheme: DEFAULT_GRAPH_THEME,
  graphDensity: DEFAULT_GRAPH_DENSITY,
  graphProvenanceMark: DEFAULT_PROVENANCE_MARK_MODE,
  graphShowCi: true,
  diffLayout: 'unified',
  diffShowOldGutter: false,
};

export const PANEL_BOUNDS = {
  detailWidth: { min: 280, max: 720, initial: DEFAULTS.layout.detailWidth },
  graphInlineHeight: { min: 200, max: 1200, initial: DEFAULTS.layout.graphInlineHeight },
};

export const coderGitStore = createPersistedStore<GitUiState, Persisted>({
  key: 'midnite-coder.git',
  defaults: DEFAULTS,
  pick: (s) => ({
    layout: s.layout,
    graphColumns: s.graphColumns,
    graphColumnVisibility: s.graphColumnVisibility,
    graphTheme: s.graphTheme,
    graphDensity: s.graphDensity,
    graphProvenanceMark: s.graphProvenanceMark,
    graphShowCi: s.graphShowCi,
    diffLayout: s.diffLayout,
    diffShowOldGutter: s.diffShowOldGutter,
  }),
  state: (set, initial) => ({
    ...initial,
    graphColumns: { ...DEFAULT_GRAPH_COLUMNS, ...initial.graphColumns },
    graphColumnVisibility: normalizeColumnVisibility(initial.graphColumnVisibility),
    selectedRepoId: coderStore.getState().selectedRepoId,
    selectedWorktreePath: null,
    graphSelection: null,
    selectCommit: (sha) => set({ graphSelection: sha === null ? null : { kind: 'commit', sha } }),
    selectWorkingTree: (open) => set({ graphSelection: open ? { kind: 'working-tree' } : null }),
    selectStash: (selector) => set({ graphSelection: selector === null ? null : { kind: 'stash', selector } }),
    selectConflict: (path) => set({ graphSelection: path === null ? null : { kind: 'conflict', path } }),
    graphWorkingCopyReveal: 0,
    setLayout: (key, value) => set((s) => ({ layout: { ...s.layout, [key]: value } })),
    setGraphColumn: (key, value) => set((s) => ({ graphColumns: { ...s.graphColumns, [key]: value } })),
    setGraphColumnVisible: (column, visible) =>
      set((s) => ({ graphColumnVisibility: withColumnVisible(s.graphColumnVisibility, column, visible) })),
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
    toggleDiffLayout: () => set((s) => ({ diffLayout: s.diffLayout === 'split' ? 'unified' : 'split' })),
    toggleDiffOldGutter: () => set((s) => ({ diffShowOldGutter: !s.diffShowOldGutter })),
  }),
});

coderStore.subscribe((s) => {
  if (s.selectedRepoId === coderGitStore.getState().selectedRepoId) return;
  coderGitStore.setState({ selectedRepoId: s.selectedRepoId, graphSelection: null, graphRefFilter: [] });
});

export function useCoderGitUi<T>(selector: (state: GitUiState) => T): T {
  return useStore(coderGitStore, selector);
}
