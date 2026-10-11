import { create } from 'zustand';

/**
 * Phase 112 Theme C — the one-shot "open this file's diff in that commit"
 * request, lifted out of `CommitDetail`'s local file selection so a reveal
 * can ask for it before the inspector has mounted (selecting the commit in
 * the graph mounts it a render later).
 *
 * A request, not a selection: `CommitDetail` owns which files are picked (it
 * resets them when the commit changes, and has a split-mode variant), so it
 * consumes the request once its commit's file list has loaded and applies it
 * through its own `toggleFile` rules. A nonce keeps asking twice meaningful.
 */
export type CommitFileRequest = { sha: string; path: string; nonce: number };

type CommitFileRequestState = {
  request: CommitFileRequest | null;
  /** Ask the inspector for `sha` to open `path`'s diff. `sha` is the full object name. */
  expandFile: (sha: string, path: string) => void;
  /** Called by the inspector once it has acted on (or dismissed) the request. */
  consume: (nonce: number) => void;
};

export const useCommitFileRequest = create<CommitFileRequestState>()((set) => ({
  request: null,
  expandFile: (sha, path) =>
    set((state) => ({ request: { sha, path, nonce: (state.request?.nonce ?? 0) + 1 } })),
  consume: (nonce) => set((state) => (state.request?.nonce === nonce ? { request: null } : state)),
}));
