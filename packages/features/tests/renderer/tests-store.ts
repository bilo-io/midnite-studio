import type { TestRunResult } from '@midnite/studio-shared';
import { create } from 'zustand';

/**
 * What the Tests view is currently looking at, and every suite's live run
 * state — the `actions-store.ts` shape, widened for a run that streams.
 *
 * Deliberately not persisted: a run id and a result belong to one session, the
 * same reasoning `actions-store.ts` gives for not persisting a run selection.
 * "Last result is remembered per suite for the session" (the phase doc's own
 * words) is exactly what `results` is for — cleared on reload, kept while the
 * renderer is alive.
 */

type ByRepo<T> = Record<string, T>;

export type SuiteRunState = {
  runId: string;
  /** Chunks as they arrive — joined lazily by the view, not on every push. */
  output: string[];
  /** Set once `testsResult` lands for this run; `output` keeps growing until then. */
  running: boolean;
};

export type TestsState = {
  /** Explicit selection. Absent means "whatever the view auto-selects". */
  selectedSuite: ByRepo<string>;
  /** Keyed by suite id — one in-flight (or last-seen) run per suite, per repo. */
  runs: ByRepo<Record<string, SuiteRunState>>;
  /** The last completed result per suite, kept until the next run replaces it. */
  results: ByRepo<Record<string, TestRunResult>>;
  /**
   * runId -> repoId, so a stream event (which only carries a run id) can be
   * routed in O(1) instead of scanning every repo's runs on every chunk.
   * Entries are removed in `finishRun`, once a run id can no longer receive
   * further stream events.
   */
  runIndex: Record<string, string>;

  selectSuite: (repoId: string, suiteId: string) => void;
  startRun: (repoId: string, suiteId: string, runId: string) => void;
  appendOutput: (repoId: string, runId: string, chunk: string) => void;
  finishRun: (repoId: string, suiteId: string, runId: string, result: TestRunResult) => void;
};

export const useTestsStore = create<TestsState>((set) => ({
  selectedSuite: {},
  runs: {},
  results: {},
  runIndex: {},

  selectSuite: (repoId, suiteId) =>
    set((state) => ({ selectedSuite: { ...state.selectedSuite, [repoId]: suiteId } })),

  startRun: (repoId, suiteId, runId) =>
    set((state) => ({
      runs: {
        ...state.runs,
        [repoId]: { ...state.runs[repoId], [suiteId]: { runId, output: [], running: true } },
      },
      runIndex: { ...state.runIndex, [runId]: repoId },
    })),

  appendOutput: (repoId, runId, chunk) =>
    set((state) => {
      const forRepo = state.runs[repoId];
      if (!forRepo) return state;
      // Find the suite this run id belongs to — the event carries only the
      // run id, and a suite is the key everything else is addressed by.
      const suiteId = Object.keys(forRepo).find((id) => forRepo[id]?.runId === runId);
      if (!suiteId) return state;
      const current = forRepo[suiteId];
      if (!current) return state;
      return {
        runs: {
          ...state.runs,
          [repoId]: { ...forRepo, [suiteId]: { ...current, output: [...current.output, chunk] } },
        },
      };
    }),

  finishRun: (repoId, suiteId, runId, result) =>
    set((state) => {
      const { [runId]: _removed, ...runIndex } = state.runIndex;
      const forRepo = state.runs[repoId];
      const current = forRepo?.[suiteId];
      // A cancel-then-rerun can make an older run's result arrive after a
      // newer one has already started — the run id is how a stale result is
      // told apart from the one actually in flight.
      if (current && current.runId !== runId) return { runIndex };
      return {
        runIndex,
        runs: {
          ...state.runs,
          [repoId]: { ...forRepo, [suiteId]: { runId, output: current?.output ?? [], running: false } },
        },
        results: { ...state.results, [repoId]: { ...state.results[repoId], [suiteId]: result } },
      };
    }),
}));

/** The current run id for a suite, if this session has started one — for `cancel`. */
export const activeRunId = (repoId: string, suiteId: string): string | null => {
  const state = useTestsStore.getState().runs[repoId]?.[suiteId];
  return state?.running ? state.runId : null;
};
