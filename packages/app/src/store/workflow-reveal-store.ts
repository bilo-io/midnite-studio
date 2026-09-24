import { create } from 'zustand';

/**
 * The imperative seam between "reveal this run in the Workflows view"
 * (a workflow-run terminal accordion group's own header button,
 * `sessions-view.tsx`, Phase 95 Theme J) and `WorkflowsView`, which owns
 * "which workflow is open" as plain local state
 * (`workflow-run-command-store.ts`'s own doc comment on why that is not
 * lifted here either). Mirrors that store's shape for the opposite
 * direction: this one carries a REQUEST rather than a registered handle,
 * because the Sessions view has no reference to a mounted `WorkflowEditor`
 * to call through — it may not even be mounted yet.
 */
export type WorkflowRevealRequest = { workflowId: string; runId: string };

type WorkflowRevealState = {
  pending: WorkflowRevealRequest | null;
  reveal: (request: WorkflowRevealRequest) => void;
  /** Consumed once `WorkflowsView`/`WorkflowEditor` has acted on it. */
  consume: () => void;
};

export const useWorkflowRevealStore = create<WorkflowRevealState>()((set) => ({
  pending: null,
  reveal: (request) => set({ pending: request }),
  consume: () => set({ pending: null }),
}));
