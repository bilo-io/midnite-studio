import type { WorkflowNodeStatus, WorkflowRun } from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { bridge } from '../../services/bridge';
import { noBridge, reportFailure } from '../../services/bridge-result';
import type { ActivityGlowSessionInput } from '../activity/use-activity-glow';
import { resolveSessionAgentId, sessionPhase, useTerminalStore } from '../terminal/terminal-store';

/**
 * Workflow run history (Phase 43 Theme G).
 *
 * **Push, then re-fetch — not polling.** Councils poll at a fixed 1200ms
 * because a member's live output rides `pty:*`, which has no event of its
 * own; a workflow node has no pty, and a 400ms run would look frozen at that
 * cadence. `workflowRunChanged` fires on every status change and, since
 * Phase 95 Theme I, carries the run itself (mirrors `loopRunsChanged`'s
 * bare-ping shape only in that it still fires on every settle) — so every
 * run-shaped query still invalidates together under one shared key prefix,
 * cheaper than a per-run patch protocol for a list this small and correct
 * regardless of which run or workflow actually changed. `useLiveWorkflowRun`
 * below is the one consumer that reads the payload directly rather than
 * waiting on the invalidated query's own round trip.
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

/**
 * The most recent `workflowRunChanged` payload for one workflow, held in
 * plain component state rather than react-query — **live run state on the
 * editing canvas** (Phase 95 Theme I's own checklist item), read straight
 * off the event instead of waiting for `useWorkflowRun`'s invalidate-then-
 * refetch round trip. `null` before the first event of this mount, or once
 * a different workflow's event arrives (filtered by `workflowId`, so two
 * open editors — a workflow's own tab plus, say, a linked one referenced
 * from a note — never cross-contaminate each other's live overlay).
 *
 * Deliberately **not** the source of truth for anything persisted: the
 * history view (`RunNodeDetail` via `useWorkflowRun`) still reads the
 * store through the ordinary query, so a reload or a second window that
 * missed this event still sees the right thing.
 */
export function useLiveWorkflowRun(workflowId: string | null): WorkflowRun | null {
  const [run, setRun] = useState<WorkflowRun | null>(null);

  useEffect(() => {
    setRun(null);
    const api = bridge();
    if (!api || !workflowId) return undefined;
    return api.workflow.onRunChanged((event) => {
      if (event.workflowId === workflowId) setRun(event.run);
    });
  }, [workflowId]);

  return run;
}

/** `useLiveWorkflowRun`'s run, reshaped for `WorkflowCanvas`'s `nodeStatuses` prop — `undefined` while nothing is live. */
export function useLiveWorkflowNodeStatuses(
  workflowId: string | null,
): ReadonlyMap<string, WorkflowNodeStatus> | undefined {
  const run = useLiveWorkflowRun(workflowId);
  return useMemo(
    () => (run ? new Map(run.nodes.map((node) => [node.nodeId, node.status])) : undefined),
    [run],
  );
}

/**
 * `useLiveWorkflowRun`'s run, reshaped for `WorkflowCanvas`'s `nodeSessions`
 * prop (Phase 95 Theme J) — every live `TerminalSession` stamped with THIS
 * run's own `workflowRunRef`, grouped by `nodeId`, in the exact
 * `ActivityGlowSessionInput` shape `useActivityGlow` already accepts (Theme
 * C wired the hook to accept a list of these for precisely this theme).
 * Filtered on `runId`, not just `workflowId`: a workflow re-run while the
 * previous run's sessions are still winding down must not glow the NEW run's
 * canvas with the OLD run's sessions.
 */
export function useLiveWorkflowNodeSessions(
  workflowId: string | null,
): ReadonlyMap<string, readonly ActivityGlowSessionInput[]> {
  const run = useLiveWorkflowRun(workflowId);
  const sessions = useTerminalStore((s) => s.sessions);
  const states = useTerminalStore((s) => s.states);
  const activity = useTerminalStore((s) => s.activity);
  const liveAgentId = useTerminalStore((s) => s.liveAgentId);

  return useMemo(() => {
    const map = new Map<string, ActivityGlowSessionInput[]>();
    if (!run) return map;
    for (const session of sessions) {
      const ref = session.workflowRunRef;
      if (!ref || ref.workflowId !== run.workflowId || ref.runId !== run.id) continue;
      const entry: ActivityGlowSessionInput = {
        sessionId: session.id,
        agentId: resolveSessionAgentId(session, liveAgentId),
        activity: activity[session.id],
        running: sessionPhase(session, states[session.id]) === 'live',
      };
      const existing = map.get(ref.nodeId);
      if (existing) existing.push(entry);
      else map.set(ref.nodeId, [entry]);
    }
    return map;
  }, [run, sessions, states, activity, liveAgentId]);
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
