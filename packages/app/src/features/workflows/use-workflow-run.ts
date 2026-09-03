import type { WorkflowRun } from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { bridge } from '../../services/bridge';
import { noBridge, reportFailure } from '../../services/bridge-result';

/**
 * Workflow run history (Phase 43 Theme G).
 *
 * **Push, then re-fetch — not polling.** Councils poll at a fixed 1200ms
 * because a member's live output rides `pty:*`, which has no event of its
 * own; a workflow node has no pty, and a 400ms run would look frozen at that
 * cadence. `workflowRunChanged` fires on every status change and carries no
 * payload (mirrors `loopRunsChanged`), so every run-shaped query invalidates
 * together under one shared key prefix — cheaper than a per-run patch
 * protocol for a list this small, and correct regardless of which run or
 * workflow actually changed.
 */
const RUN_KEYS = {
  root: ['workflow-runs'] as const,
  forWorkflow: (workflowId: string) => ['workflow-runs', 'list', workflowId] as const,
  run: (runId: string) => ['workflow-runs', 'detail', runId] as const,
};

/** Every host subscribes independently — cheap, and avoids an app-root wiring dependency. */
function useWorkflowRunEvents(): void {
  const client = useQueryClient();
  useEffect(() => {
    const api = bridge();
    if (!api) return undefined;
    return api.workflow.onRunChanged(() => {
      void client.invalidateQueries({ queryKey: RUN_KEYS.root });
    });
  }, [client]);
}

export function useWorkflowRuns(workflowId: string | null) {
  useWorkflowRunEvents();
  return useQuery({
    queryKey: RUN_KEYS.forWorkflow(workflowId ?? ''),
    queryFn: async () => (await bridge()?.workflow.runs.list({ workflowId: workflowId ?? '' }))?.runs ?? [],
    enabled: workflowId !== null,
    initialData: [],
  });
}

export function useWorkflowRun(runId: string | null) {
  useWorkflowRunEvents();
  return useQuery<WorkflowRun | null>({
    queryKey: RUN_KEYS.run(runId ?? ''),
    queryFn: async () => (await bridge()?.workflow.runs.get({ runId: runId ?? '' }))?.run ?? null,
    enabled: runId !== null,
  });
}

export function useRunWorkflow() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (workflowId: string) =>
      (await bridge()?.workflow.run({ workflowId })) ?? noBridge<WorkflowRun>(),
    onSuccess: (result) => {
      reportFailure(result);
      if (result.ok) void client.invalidateQueries({ queryKey: RUN_KEYS.root });
    },
  });
}
