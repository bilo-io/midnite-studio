import type { Workflow, WorkflowRun } from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { bridge } from '../../services/bridge';
import { noBridge, reportFailure } from '../../services/bridge-result';

/**
 * Workflows are global, not per-repo — deliberately absent from
 * `services/queries.ts` for the reason `use-council.ts` records: nothing
 * about a global entity invalidates on a watcher event, a ref change, or any
 * of the other reasons that file's keys are shaped the way they are.
 *
 * There is no per-id `get` channel — the list is capped-small (workflows are
 * hand-built, not generated), so every consumer reads one `workflows` query
 * and finds its id in it, exactly as `workflow.run`'s own docblock reasons
 * about `workflowRunChanged` carrying no payload.
 */
const WORKFLOW_KEYS = {
  list: ['workflows'] as const,
};

export function useWorkflows() {
  return useQuery({
    queryKey: WORKFLOW_KEYS.list,
    queryFn: async () => (await bridge()?.workflow.list())?.workflows ?? [],
  });
}

export function useSaveWorkflow() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (workflow: Workflow) =>
      (await bridge()?.workflow.save({ workflow })) ?? noBridge<Workflow>(),
    onSuccess: (result) => {
      reportFailure<Workflow>(result);
      if (result.ok) void client.invalidateQueries({ queryKey: WORKFLOW_KEYS.list });
    },
  });
}

export function useDeleteWorkflow() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await bridge()?.workflow.delete({ id })) ?? noBridge<void>(),
    onSuccess: (result) => {
      reportFailure<void>(result);
      if (result.ok) void client.invalidateQueries({ queryKey: WORKFLOW_KEYS.list });
    },
  });
}

/**
 * Starts a run and reports failure the way every other mutation here does.
 *
 * Deliberately does not touch run state or subscribe to `onRunChanged` —
 * that live-progress/history surface is Theme G's ("Runs"), not this one's.
 * Theme F's whole stake in a run is refusing to start an invalid one, which
 * is enforced by disabling the button that calls this, not by anything here.
 */
export function useRunWorkflow() {
  return useMutation({
    mutationFn: async (workflowId: string) =>
      (await bridge()?.workflow.run({ workflowId })) ?? noBridge<WorkflowRun>(),
    onSuccess: (result) => reportFailure(result),
  });
}
