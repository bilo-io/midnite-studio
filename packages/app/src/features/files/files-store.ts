import { create } from 'zustand';

/**
 * An in-progress rename or create, rendered as an inline `<input>` in place of
 * the row it targets (rename) or as an extra row appended under its parent
 * (create). One at a time, like the dialog host's menu/confirm/prompt — a
 * second edit starting closes whichever is open, rather than the tree
 * tracking a set.
 */
export type EditingEntry =
  | { kind: 'rename'; relPath: string; initialName: string }
  | { kind: 'create'; parentPath: string; entryKind: 'file' | 'directory'; initialName: string };

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
  /** The row currently rendering an inline input, or null. */
  editing: EditingEntry | null;

  /** Reset if the checkout changed; no-op otherwise. */
  ensureScope: (scopeKey: string) => void;
  toggleDir: (relPath: string) => void;
  selectFile: (relPath: string | null) => void;
  startRename: (relPath: string, initialName: string) => void;
  /** Also force-expands `parentPath` so the new inline row is visible immediately. */
  startCreate: (parentPath: string, entryKind: 'file' | 'directory', initialName: string) => void;
  cancelEdit: () => void;
};

export const useFilesStore = create<FilesState>()((set, get) => ({
  scopeKey: null,
  expanded: {},
  selectedPath: null,
  editing: null,

  ensureScope: (scopeKey) => {
    if (get().scopeKey === scopeKey) return;
    set({ scopeKey, expanded: {}, selectedPath: null, editing: null });
  },

  toggleDir: (relPath) =>
    set((state) => {
      const expanded = { ...state.expanded };
      if (expanded[relPath]) delete expanded[relPath];
      else expanded[relPath] = true;
      return { expanded };
    }),

  selectFile: (selectedPath) => set({ selectedPath }),

  startRename: (relPath, initialName) =>
    set({ editing: { kind: 'rename', relPath, initialName } }),

  startCreate: (parentPath, entryKind, initialName) =>
    set((state) => ({
      editing: { kind: 'create', parentPath, entryKind, initialName },
      expanded:
        parentPath.length > 0 && !state.expanded[parentPath]
          ? { ...state.expanded, [parentPath]: true }
          : state.expanded,
    })),

  cancelEdit: () => set({ editing: null }),
}));
