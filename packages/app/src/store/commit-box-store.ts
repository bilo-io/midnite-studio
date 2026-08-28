import { create } from 'zustand';

/**
 * The one imperative seam between a global command and the Changes view's
 * commit box.
 *
 * The draft message and its validation live in `StatusPanel`'s own local
 * state, not here — lifting them would mean two places computing "can this
 * commit" instead of one. `StatusPanel` registers a handle that closes over
 * its own `onCommit` on mount and clears it on unmount, so
 * `status.commit` (Mod+Enter) can trigger exactly what a click on the button
 * would, without reimplementing what it does.
 */
export type CommitBoxHandle = {
  /** Focuses the textarea, and submits when the button would not be disabled. */
  run: () => void;
};

type CommitBoxState = {
  handle: CommitBoxHandle | null;
  register: (handle: CommitBoxHandle) => void;
  /** A no-op unless `handle` is still the one being unregistered — guards
   * against a fast remount unregistering the newer handle that replaced it. */
  unregister: (handle: CommitBoxHandle) => void;
};

export const useCommitBoxStore = create<CommitBoxState>()((set, get) => ({
  handle: null,
  register: (handle) => set({ handle }),
  unregister: (handle) => {
    if (get().handle === handle) set({ handle: null });
  },
}));
