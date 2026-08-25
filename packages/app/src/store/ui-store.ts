import { create } from 'zustand';

/** The main content views the rail switches between. */
export type ViewId = 'graph' | 'changes' | 'settings';

/**
 * Ephemeral UI state — what's selected, what's open, how the panes are sized.
 *
 * Deliberately separate from TanStack Query (which owns main-process data) and
 * from the graph store (which owns streamed rows): this is the state that
 * belongs to the window, survives no refetch, and is written from event
 * handlers all over the tree.
 */
export type UiState = {
  activeView: ViewId;
  selectedRepoId: string | null;
  selectedWorktreePath: string | null;
  selectedCommitSha: string | null;
  terminalOpen: boolean;

  setActiveView: (view: ViewId) => void;
  selectRepo: (repoId: string | null) => void;
  selectWorktree: (path: string | null) => void;
  selectCommit: (sha: string | null) => void;
  toggleTerminal: () => void;
  setTerminalOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  activeView: 'graph',
  selectedRepoId: null,
  selectedWorktreePath: null,
  selectedCommitSha: null,
  terminalOpen: false,

  setActiveView: (activeView) => set({ activeView }),
  // Switching repo invalidates every selection scoped to the old one.
  selectRepo: (selectedRepoId) =>
    set({ selectedRepoId, selectedWorktreePath: null, selectedCommitSha: null }),
  selectWorktree: (selectedWorktreePath) => set({ selectedWorktreePath }),
  selectCommit: (selectedCommitSha) => set({ selectedCommitSha }),
  toggleTerminal: () => set((state) => ({ terminalOpen: !state.terminalOpen })),
  setTerminalOpen: (terminalOpen) => set({ terminalOpen }),
}));

/** Route path for a view — AppFrame is router-agnostic and compares strings. */
export const pathForView = (view: ViewId): string => `/${view}`;
export const viewForPath = (path: string): ViewId =>
  path === '/changes' ? 'changes' : path === '/settings' ? 'settings' : 'graph';
