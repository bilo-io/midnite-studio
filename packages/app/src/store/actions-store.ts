import { create } from 'zustand';

/**
 * What the Actions view is currently looking at.
 *
 * A store rather than component state because the *sidebar* chooses it: clicking
 * a run row switches to the view with that run selected, and the two live in
 * different trees. It is the same reason `dashboard-store` exists.
 *
 * Deliberately NOT persisted, unlike the dashboard's layouts. Every value here
 * is a run id or a job name, and both age out of `gh run list` within days — a
 * restored selection would be a pane opening on "that run is no longer in the
 * recent list", which is worse than opening on the newest failure. Geometry
 * persists (in `ui-store`'s `layout`); the selection does not.
 */

/** Keyed by repo, so switching repositories in the sidebar keeps both answers. */
type ByRepo<T> = Record<string, T>;

export type ActionsState = {
  /** Explicit selection. Absent means "whatever the view auto-selects". */
  selectedRun: ByRepo<string>;
  /** Job *name*, not id — the log carries only the name. */
  selectedJob: ByRepo<string>;
  /** Workflow group keys the user has folded away, per repo. */
  collapsedWorkflows: ByRepo<string[]>;

  /**
   * Select a run, and clear the job with it.
   *
   * One action rather than two calls, because a job name from the previous run
   * is meaningless against this one — the log pane would look up a job that is
   * not in the model and show nothing, which reads as a broken pane.
   */
  selectRun: (repoId: string, runId: string) => void;
  selectJob: (repoId: string, job: string | null) => void;
  toggleWorkflow: (repoId: string, key: string) => void;
};

export const useActionsStore = create<ActionsState>((set) => ({
  selectedRun: {},
  selectedJob: {},
  collapsedWorkflows: {},

  selectRun: (repoId, runId) =>
    set((state) => {
      const { [repoId]: _cleared, ...job } = state.selectedJob;
      return { selectedRun: { ...state.selectedRun, [repoId]: runId }, selectedJob: job };
    }),

  selectJob: (repoId, job) =>
    set((state) => {
      if (job === null) {
        const { [repoId]: _cleared, ...rest } = state.selectedJob;
        return { selectedJob: rest };
      }
      return { selectedJob: { ...state.selectedJob, [repoId]: job } };
    }),

  toggleWorkflow: (repoId, key) =>
    set((state) => {
      const current = state.collapsedWorkflows[repoId] ?? [];
      const next = current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key];
      return { collapsedWorkflows: { ...state.collapsedWorkflows, [repoId]: next } };
    }),
}));
