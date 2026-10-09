import { create } from 'zustand';

import {
  backHistoryState,
  forwardHistoryState,
  pushHistoryState,
  type PanelHistoryState,
} from '../../components/panel-stack/use-panel-history';

/**
 * One step of the Files view's browse history: a file, an optional `#anchor`
 * inside it and the scroll offset it was left at (written back when the user
 * navigates away, so Back lands where they were, not at the top).
 */
export type FileNavEntry = { relPath: string; anchor: string | null; scrollTop: number };

/** What the open preview should scroll to; `nonce` re-fires an identical target. */
export type ScrollRestore = { anchor: string | null; scrollTop: number | null; nonce: number };

const sameTarget = (a: FileNavEntry, b: FileNavEntry): boolean =>
  a.relPath === b.relPath && a.anchor === b.anchor;

function parentsOf(relPath: string, expanded: Record<string, true>): Record<string, true> {
  const parts = relPath.split('/');
  if (parts.length <= 1) return expanded;
  const next = { ...expanded };
  let acc = '';
  for (const part of parts.slice(0, -1)) {
    acc = acc ? `${acc}/${part}` : part;
    next[acc] = true;
  }
  return next;
}

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
  /** Browse history (oldest first) — drives Back/Forward across documents. */
  nav: PanelHistoryState<FileNavEntry>;
  /** Scroll target for the open preview; set by every navigation. */
  restore: ScrollRestore;

  /**
   * Opens `relPath` (revealing it in the tree) and pushes a history entry —
   * a no-op push when file and anchor equal the current entry.
   */
  navigate: (relPath: string, anchor?: string | null) => void;
  /** An in-page `#anchor` click: pushes an entry for the current file. */
  navigateAnchor: (anchor: string) => void;
  /** Remembers the open preview's scroll offset on the current entry. */
  recordScroll: (scrollTop: number) => void;
  back: () => void;
  forward: () => void;

  /** Reset if the checkout changed; no-op otherwise. */
  ensureScope: (scopeKey: string) => void;
  toggleDir: (relPath: string) => void;
  expandDirs: (relPaths: string[]) => void;
  selectFile: (relPath: string | null) => void;
  /** Selects a file and ensures all its parent directories are expanded. */
  revealFile: (relPath: string) => void;
  startRename: (relPath: string, initialName: string) => void;
  /** Also force-expands `parentPath` so the new inline row is visible immediately. */
  startCreate: (parentPath: string, entryKind: 'file' | 'directory', initialName: string) => void;
  cancelEdit: () => void;
  /** @internal shared body of `back`/`forward`. */
  go: (move: (s: PanelHistoryState<FileNavEntry>) => PanelHistoryState<FileNavEntry>) => void;
};

export const useFilesStore = create<FilesState>()((set, get) => ({
  scopeKey: null,
  expanded: {},
  selectedPath: null,
  editing: null,
  nav: { entries: [], index: -1 },
  restore: { anchor: null, scrollTop: null, nonce: 0 },

  navigate: (relPath, anchor = null) =>
    set((state) => {
      const entry: FileNavEntry = { relPath, anchor, scrollTop: 0 };
      const cur = state.nav.entries[state.nav.index];
      // Re-selecting the open file (no anchor) must not yank its scroll to the top.
      if (cur && anchor === null && cur.relPath === relPath && state.selectedPath === relPath) return state;
      const nav = pushHistoryState(state.nav, entry, sameTarget);
      return {
        nav,
        selectedPath: relPath,
        expanded: parentsOf(relPath, state.expanded),
        restore: { anchor, scrollTop: null, nonce: state.restore.nonce + 1 },
      };
    }),

  navigateAnchor: (anchor) => {
    const current = get().nav.entries[get().nav.index];
    if (current) get().navigate(current.relPath, anchor);
  },

  recordScroll: (scrollTop) =>
    set((state) => {
      const current = state.nav.entries[state.nav.index];
      if (!current || current.scrollTop === scrollTop) return state;
      const entries = [...state.nav.entries];
      entries[state.nav.index] = { ...current, scrollTop };
      return { nav: { entries, index: state.nav.index } };
    }),

  back: () => get().go(backHistoryState),
  forward: () => get().go(forwardHistoryState),

  go: (move) =>
    set((state) => {
      const nav = move(state.nav);
      const entry = nav.entries[nav.index];
      if (nav === state.nav || !entry) return state;
      return {
        nav,
        selectedPath: entry.relPath,
        expanded: parentsOf(entry.relPath, state.expanded),
        restore: {
          anchor: entry.anchor,
          scrollTop: entry.scrollTop,
          nonce: state.restore.nonce + 1,
        },
      };
    }),

  ensureScope: (scopeKey) => {
    if (get().scopeKey === scopeKey) return;
    set({
      scopeKey,
      expanded: {},
      selectedPath: null,
      editing: null,
      nav: { entries: [], index: -1 },
    });
  },

  toggleDir: (relPath) =>
    set((state) => {
      const expanded = { ...state.expanded };
      if (expanded[relPath]) delete expanded[relPath];
      else expanded[relPath] = true;
      return { expanded };
    }),

  expandDirs: (relPaths) =>
    set((state) => {
      const expanded = { ...state.expanded };
      for (const p of relPaths) {
        if (p.length > 0) expanded[p] = true;
      }
      return { expanded };
    }),

  selectFile: (selectedPath) => {
    if (selectedPath === null) set({ selectedPath });
    else get().navigate(selectedPath);
  },

  revealFile: (relPath) => get().navigate(relPath),

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
