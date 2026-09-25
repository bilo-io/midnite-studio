import type { WorkflowNodeRun, WorkflowNodeStatus, WorkflowRun } from '@midnite/studio-shared';

/**
 * Step-through replay for the run-history view (Phase 95 Theme I, porting
 * midnite's `run-history-panel.tsx` `step`/`applyRunState` — see the crib's
 * `sorted.slice(0, step)`). Pure and side-effect-free so it is unit-testable
 * without mounting the canvas: `nodeStatusesAtStep` is what
 * `workflows-view.tsx` feeds `WorkflowCanvas.nodeStatuses`/`nodeErrors` while
 * a `RunReplayControls` scrubber is in play, instead of the run's own final
 * per-node statuses.
 *
 * **Ordering.** A node "happens" when it started — `startedAt` — or, for one
 * that never started (skipped by an upstream failure/false condition),
 * whenever the cascade settled it (`endedAt`; `workflow-engine.ts`'s skip
 * cascade sets only that field). Ties broken by `nodeId` so replay order is
 * stable and reproducible across renders, not an artifact of `Array.sort`'s
 * engine-dependent behaviour on equal keys.
 */
export function replayOrder(run: WorkflowRun): WorkflowNodeRun[] {
  const key = (node: WorkflowNodeRun): number => node.startedAt ?? node.endedAt ?? Number.POSITIVE_INFINITY;
  return [...run.nodes].sort((a, b) => key(a) - key(b) || a.nodeId.localeCompare(b.nodeId));
}

/**
 * `step` nodes (in {@link replayOrder}) have "happened" — those show their
 * real recorded status and error; every node after `step` reads as
 * `pending`, the same way it looked before the run reached it. `step === 0`
 * is the run's very start (nothing settled yet); `step === run.nodes.length`
 * is the run's final, complete state — `RunReplayControls`' own "Last step".
 */
export function nodeStatusesAtStep(
  run: WorkflowRun,
  step: number,
): {
  statuses: ReadonlyMap<string, WorkflowNodeStatus>;
  errors: ReadonlyMap<string, string>;
  /** `WorkflowNodeRun.settledPort` as of this step (Phase 97 Theme J) — what the canvas's taken/dead edge highlighting reads while a `RunReplayControls` scrubber is in play. Unset entries (a node not yet reached, or one with no routable settle) are simply absent, same as `errors`. */
  settledPorts: ReadonlyMap<string, string>;
} {
  const order = replayOrder(run);
  const statuses = new Map<string, WorkflowNodeStatus>();
  const errors = new Map<string, string>();
  const settledPorts = new Map<string, string>();
  order.forEach((node, index) => {
    if (index < step) {
      statuses.set(node.nodeId, node.status);
      if (node.error !== undefined) errors.set(node.nodeId, node.error);
      if (node.settledPort !== undefined) settledPorts.set(node.nodeId, node.settledPort);
    } else {
      statuses.set(node.nodeId, 'pending');
    }
  });
  return { statuses, errors, settledPorts };
}
