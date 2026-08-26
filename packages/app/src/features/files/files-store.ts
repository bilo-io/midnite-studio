import { create } from 'zustand';

/**
 * The Files view's UI state — which directories are expanded and which file
 * is selected. Deliberately NOT persisted (the tree is cheap to re-open and a
 * stale selection into a deleted file is worse than none), and keyed per
 * checkout so switching repo or worktree starts a fresh browse rather than
 * carrying `packages/app/src` into a repo that has no such path.
 */
type FilesState = {
  /** The checkout the current expansion/selection belongs to. */
  scopeKey: string | null;
  /** Expanded directory relPaths. A record, not a Set — zustand-friendly spreads. */
  expanded: Record<string, true>;
  /** Selected file's relPath, or null. */
  selectedPath: string | null;

  /** Reset if the checkout changed; no-op otherwise. */
  ensureScope: (scopeKey: string) => void;
  toggleDir: (relPath: string) => void;
  selectFile: (relPath: string | null) => void;
};

export const useFilesStore = create<FilesState>()((set, get) => ({
  scopeKey: null,
  expanded: {},
  selectedPath: null,

  ensureScope: (scopeKey) => {
    if (get().scopeKey === scopeKey) return;
    set({ scopeKey, expanded: {}, selectedPath: null });
  },

  toggleDir: (relPath) =>
    set((state) => {
      const expanded = { ...state.expanded };
      if (expanded[relPath]) delete expanded[relPath];
      else expanded[relPath] = true;
      return { expanded };
    }),

  selectFile: (selectedPath) => set({ selectedPath }),
}));
