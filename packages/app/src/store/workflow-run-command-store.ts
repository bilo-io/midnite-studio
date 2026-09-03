import { create } from 'zustand';

/**
 * The one imperative seam between the global `workflow.run` command (Theme I)
 * and whichever workflow is actually open — the same shape
 * `commit-box-store.ts` uses for `status.commit`.
 *
 * The open workflow's id lives in `WorkflowsView`'s own local state, not
 * here — lifting it would mean two places tracking "which workflow is
 * selected." `WorkflowEditor` (mounted only while one is) registers a handle
 * closing over its own `runWorkflow.mutate`, so the palette command can
 * trigger exactly what the canvas's Run button would, without knowing which
 * workflow that is. No workflow open means no handle, which is what lets the
 * command stay `enabled: true` unconditionally and simply no-op.
 */
export type WorkflowRunHandle = {
  run: () => void;
};

type WorkflowRunCommandState = {
  handle: WorkflowRunHandle | null;
  register: (handle: WorkflowRunHandle) => void;
  /** A no-op unless `handle` is still the one being unregistered — guards
   * against a fast remount unregistering the newer handle that replaced it. */
  unregister: (handle: WorkflowRunHandle) => void;
};

export const useWorkflowRunCommandStore = create<WorkflowRunCommandState>()((set, get) => ({
  handle: null,
  register: (handle) => set({ handle }),
  unregister: (handle) => {
    if (get().handle === handle) set({ handle: null });
  },
}));
