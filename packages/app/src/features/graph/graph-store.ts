import type { GraphRow } from '@midnite/studio-shared';
import { create } from 'zustand';

/**
 * Streamed graph rows.
 *
 * Deliberately NOT in TanStack Query. Query caches a whole value and replaces it
 * on each update; the graph arrives as ~100 append-only batches of 500 rows, and
 * re-setting a growing 50 000-element array a hundred times is both a lot of
 * garbage and a lot of re-renders. A store the reducer appends to is the right
 * shape for a stream.
 *
 * Everything is keyed by `requestId`, which is the mechanism that keeps repo
 * switching correct: cancelling a stream cannot un-send bytes git has already
 * written into the pipe, so batches from the previous repo WILL arrive after the
 * switch. They carry the old id and are dropped.
 */
export type GraphState = {
  /** The stream whose rows are currently accepted. Null when idle. */
  requestId: string | null;
  /** Which repo the rows belong to — guards against a mismatched render. */
  repoId: string | null;
  rows: GraphRow[];
  loading: boolean;
  /** True when the log stopped at the row cap rather than at the root commit. */
  truncated: boolean;
  error: string | null;

  /** Begin a new stream: clears rows and starts accepting `requestId`. */
  begin: (repoId: string, requestId: string) => void;
  /** Append a batch — a no-op unless it belongs to the accepted stream. */
  appendBatch: (requestId: string, rows: GraphRow[]) => void;
  /** Mark the accepted stream finished. */
  finish: (requestId: string, info: { truncated: boolean; error?: string }) => void;
  /** Drop everything (repo closed, or no selection). */
  reset: () => void;
  /**
   * Ask for a fresh stream of the same repo.
   *
   * A counter rather than a boolean flag: the stream hook keys an effect on it,
   * and a flag would have to be reset afterwards — a two-step handshake with a
   * window in which a second request is silently swallowed.
   */
  requestRestream: () => void;
  restreamNonce: number;
};

const EMPTY = {
  requestId: null,
  repoId: null,
  rows: [] as GraphRow[],
  loading: false,
  truncated: false,
  error: null,
};

export const useGraphStore = create<GraphState>((set, get) => ({
  ...EMPTY,
  restreamNonce: 0,

  begin: (repoId, requestId) =>
    set({ ...EMPTY, repoId, requestId, loading: true, rows: [] }),

  appendBatch: (requestId, rows) => {
    const state = get();
    if (state.requestId !== requestId) return;
    // Mutate the existing buffer in place: push is amortized O(batch size),
    // where concat's full copy of everything accumulated so far turned a
    // 50 000-row stream into ~2.5M copied elements across its ~100 batches.
    // The array's own reference is therefore stable for the life of a stream
    // (a fresh one is only handed out by `begin`/`reset`) — consumers that
    // need to notice new rows arriving must key off `rows.length`, which
    // changes by value on every batch, rather than the array's identity.
    state.rows.push(...rows);
    set({ rows: state.rows });
  },

  finish: (requestId, info) => {
    if (get().requestId !== requestId) return;
    set({ loading: false, truncated: info.truncated, error: info.error ?? null });
  },

  reset: () => set({ ...EMPTY, rows: [] }),

  requestRestream: () => set((state) => ({ restreamNonce: state.restreamNonce + 1 })),
}));
