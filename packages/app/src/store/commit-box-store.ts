import { create } from 'zustand';

/**
 * The one imperative seam between a global command and a commit box, plus the
 * draft message every commit box for the same checkout shares.
 *
 * The commit box lives in the graph's working-copy panel (the standalone
 * Changes view that used to be a second host is gone). Validation still lives
 * in the box (`CommitBox` in `working-tree-changes.tsx`). What lives here is
 * the DRAFT: the inline panel unmounts when it collapses, and a half-written
 * message must not go with it.
 *
 * A box registers a handle closing over its own `onCommit`, so
 * `status.commit` (Mod+Enter) triggers exactly what a click on the button
 * would, without reimplementing it. Handles STACK — a box registers only
 * while it is on screen (a detached graph window's copy included), so the
 * topmost handle is always the box the user is looking at, and closing the
 * panel hands the shortcut back rather than leaving it pointing at nothing.
 */
export type CommitBoxHandle = {
  /** Focuses the textarea, and submits when the button would not be disabled. */
  run: () => void;
};

type CommitBoxState = {
  /** The topmost registered handle — the one `status.commit` calls. */
  handle: CommitBoxHandle | null;
  handles: readonly CommitBoxHandle[];
  register: (handle: CommitBoxHandle) => void;
  /** Removes exactly `handle`, wherever it sits — a fast remount unregistering
   * an old handle never drops the newer one that replaced it. */
  unregister: (handle: CommitBoxHandle) => void;
  /** Draft messages, keyed by {@link draftKey}. In memory only — never persisted. */
  drafts: Readonly<Record<string, string>>;
  setDraft: (key: string, message: string) => void;
};

/** One draft per checkout: a linked worktree's commit is not the main checkout's. */
export const draftKey = (repoId: string, worktreePath: string | undefined): string =>
  `${repoId}\u0000${worktreePath ?? ''}`;

export const useCommitBoxStore = create<CommitBoxState>()((set, get) => ({
  handle: null,
  handles: [],
  register: (handle) => {
    const handles = [...get().handles.filter((h) => h !== handle), handle];
    set({ handles, handle });
  },
  unregister: (handle) => {
    const handles = get().handles.filter((h) => h !== handle);
    set({ handles, handle: handles.at(-1) ?? null });
  },
  drafts: {},
  setDraft: (key, message) =>
    set((state) => {
      if (message.length === 0) {
        if (!(key in state.drafts)) return state;
        const { [key]: _dropped, ...rest } = state.drafts;
        return { drafts: rest };
      }
      return { drafts: { ...state.drafts, [key]: message } };
    }),
}));
