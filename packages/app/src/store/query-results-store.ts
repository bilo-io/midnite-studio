import { create } from 'zustand';

/**
 * Streamed query results, one entry per query tab.
 *
 * Modelled on `graph-store.ts`'s single-stream shape, widened to a map keyed
 * by tab id: unlike the commit graph (one stream at a time, restarted per
 * repo), the Database view can have several query tabs open at once, each
 * running independently (Verification: "two query tabs on one connection run
 * independently"). Everything is keyed by `requestId` within its own tab's
 * entry, which is what lets a stale batch from a superseded run (Decision 8 —
 * `'query'` joins `stream-registry.ts` as `'supersede'`) be silently dropped
 * rather than appended to the wrong run.
 *
 * `rows` is mutated in place per batch and the entry object replaced at the
 * map level — the same "push is amortised, full-array copy is not" reasoning
 * `graph-store.ts` documents for its own 50 000-row streams.
 */
export type QueryRunState = {
  requestId: string | null;
  columns: string[];
  rows: unknown[][];
  loading: boolean;
  rowCount: number;
  truncated: boolean;
  durationMs: number | null;
  error: string | null;
};

export const EMPTY_QUERY_RUN: QueryRunState = {
  requestId: null,
  columns: [],
  rows: [],
  loading: false,
  rowCount: 0,
  truncated: false,
  durationMs: null,
  error: null,
};

export type QueryResultsState = {
  runs: Record<string, QueryRunState>;
  /** Begin a new run for this tab: clears its previous rows, starts accepting `requestId`. */
  begin: (tabId: string, requestId: string) => void;
  /** Append a batch — a no-op unless it belongs to this tab's currently-accepted `requestId`. */
  appendBatch: (tabId: string, requestId: string, columns: string[], rows: unknown[][]) => void;
  /** Mark the accepted run finished (or failed). */
  finish: (
    tabId: string,
    requestId: string,
    info: { rowCount: number; truncated: boolean; durationMs: number; error?: string },
  ) => void;
  /** Drop a tab's run entirely — called when its tab closes. */
  clear: (tabId: string) => void;
};

export const useQueryResultsStore = create<QueryResultsState>()((set, get) => ({
  runs: {},

  begin: (tabId, requestId) =>
    set((state) => ({
      runs: { ...state.runs, [tabId]: { ...EMPTY_QUERY_RUN, requestId, loading: true } },
    })),

  appendBatch: (tabId, requestId, columns, rows) => {
    const run = get().runs[tabId];
    if (!run || run.requestId !== requestId) return;
    if (run.columns.length === 0 && columns.length > 0) run.columns = columns;
    for (const row of rows) run.rows.push(row);
    set((state) => ({ runs: { ...state.runs, [tabId]: run } }));
  },

  finish: (tabId, requestId, info) => {
    const run = get().runs[tabId];
    if (!run || run.requestId !== requestId) return;
    set((state) => ({
      runs: {
        ...state.runs,
        [tabId]: {
          ...run,
          loading: false,
          rowCount: info.rowCount,
          truncated: info.truncated,
          durationMs: info.durationMs,
          error: info.error ?? null,
        },
      },
    }));
  },

  clear: (tabId) =>
    set((state) => {
      const next = { ...state.runs };
      delete next[tabId];
      return { runs: next };
    }),
}));

export function useQueryRun(tabId: string): QueryRunState {
  return useQueryResultsStore((state) => state.runs[tabId] ?? EMPTY_QUERY_RUN);
}
