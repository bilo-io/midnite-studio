import { nodeRunIteration, nodeRunSettledAt, type WorkflowNodeRun, type WorkflowNodeStatus, type WorkflowRun } from '@midnite/studio-shared';

/**
 * Replay **by iteration** (Phase 97 Theme K) — a second, additive way to
 * scrub a run's history alongside `run-replay.ts`'s existing flat step
 * scrubber, not a replacement for it.
 *
 * **Why this is a separate module, with its own ordering, rather than a
 * change to `run-replay.ts`'s own `replayOrder`.** The phase doc's checklist
 * says replay orders "by `(iteration, settledAt)`" — but `WorkflowNodeRun
 * .iteration` (Theme C) is only ever set for a node INSIDE a loop body; a
 * node before or after the loop keeps it unset, reading as `1`
 * ({@link nodeRunIteration}). A single GLOBAL sort of the whole run's flat
 * node list with iteration as the PRIMARY key would then put a post-loop
 * node (iteration 1) ahead of a later loop pass (iteration 2, 3…) even
 * though it settled after it in real time — exactly the shape of Theme L's
 * own `harness-bounded-build` template (loop → exhausted → human gate). So
 * `run-replay.ts`'s flat scrubber stays purely chronological, unchanged, and
 * `(iteration, settledAt)` is instead what orders each of the two things
 * this module actually builds: one pass's own set of node runs
 * ({@link nodesForIteration}), and one node's own accumulated iteration
 * history ({@link nodeRunGroups}) — both correct and unambiguous uses of
 * that tuple, since neither reshuffles nodes that belong to DIFFERENT
 * iterations against each other.
 */

const byIterationThenSettledAt = (a: WorkflowNodeRun, b: WorkflowNodeRun): number =>
  nodeRunIteration(a) - nodeRunIteration(b) || nodeRunSettledAt(a) - nodeRunSettledAt(b) || a.nodeId.localeCompare(b.nodeId);

/**
 * Every distinct iteration number the run's own node records touched,
 * ascending. A run with no loop in play (every record unset/1) reads as
 * `[1]` — the scrubber's own caller hides itself when this has one entry.
 */
export function runIterations(run: WorkflowRun): number[] {
  const seen = new Set<number>();
  for (const node of run.nodes) seen.add(nodeRunIteration(node));
  return [...seen].sort((a, b) => a - b);
}

/** "Pass N of **M**" — M is how many passes actually ran, never a loop edge's configured cap (a bound the run never reached did not happen). */
export function totalIterations(run: WorkflowRun): number {
  return runIterations(run).reduce((max, iteration) => Math.max(max, iteration), 1);
}

/** One pass's own node-run records, ordered `(iteration, settledAt)` — trivially by `settledAt` within one fixed iteration, tie-broken by `nodeId`. */
export function nodesForIteration(run: WorkflowRun, iteration: number): WorkflowNodeRun[] {
  return run.nodes.filter((node) => nodeRunIteration(node) === iteration).sort(byIterationThenSettledAt);
}

/**
 * The canvas state for one pass (the iteration scrubber's own "paint this
 * pass's statuses and taken edge"): a loop-body node shows THAT pass's own
 * record; a node with no loop affiliation (never appears under any iteration
 * but the one it always has) shows its real final status once this pass's
 * own last record has settled on or after it, `pending` before that — the
 * same "has this happened yet" question `run-replay.ts`'s
 * `nodeStatusesAtStep` answers for the flat scrubber, bounded by a pass
 * instead of a step count.
 */
export function nodeStatusesAtIteration(
  run: WorkflowRun,
  iteration: number,
): {
  statuses: ReadonlyMap<string, WorkflowNodeStatus>;
  errors: ReadonlyMap<string, string>;
  settledPorts: ReadonlyMap<string, string>;
} {
  // `nodeRunIteration` reads an unset field as `1` — which would otherwise
  // make every plain, non-looped node look like "this pass's own record"
  // specifically for pass 1. A node id is only genuinely loop-affiliated when
  // it accumulated MORE THAN ONE record across the whole run (Theme C: one
  // per iteration it actually reached) — the same signal
  // `run-output-panel.tsx`'s "Pass N" badge uses. Everything else always
  // goes through the chronology check below, regardless of which pass is
  // selected — and is excluded from `passEnd`'s own computation too, so a
  // post-loop node's own (late) settle time never leaks into "when did this
  // pass end".
  const recordCounts = new Map<string, number>();
  for (const node of run.nodes) recordCounts.set(node.nodeId, (recordCounts.get(node.nodeId) ?? 0) + 1);
  const isLoopAffiliated = (nodeId: string): boolean => (recordCounts.get(nodeId) ?? 0) > 1;

  const passNodes = nodesForIteration(run, iteration).filter((node) => isLoopAffiliated(node.nodeId));
  const passEnd = passNodes.reduce((max, node) => Math.max(max, nodeRunSettledAt(node)), Number.NEGATIVE_INFINITY);
  const passRecordByNodeId = new Map(passNodes.map((node) => [node.nodeId, node]));

  const statuses = new Map<string, WorkflowNodeStatus>();
  const errors = new Map<string, string>();
  const settledPorts = new Map<string, string>();
  const seenNodeIds = new Set<string>();

  const paint = (nodeId: string, record: WorkflowNodeRun) => {
    statuses.set(nodeId, record.status);
    if (record.error !== undefined) errors.set(nodeId, record.error);
    if (record.settledPort !== undefined) settledPorts.set(nodeId, record.settledPort);
  };

  for (const node of run.nodes) {
    if (seenNodeIds.has(node.nodeId)) continue;
    seenNodeIds.add(node.nodeId);

    if (isLoopAffiliated(node.nodeId)) {
      // This pass either reached it (paint that pass's own record) or it
      // hasn't yet — never a chronology fallback, since "reached iteration
      // N" is exactly what having a record for iteration N means.
      const passRecord = passRecordByNodeId.get(node.nodeId);
      if (passRecord) paint(node.nodeId, passRecord);
      else statuses.set(node.nodeId, 'pending');
      continue;
    }

    // A plain node (before or after the loop, never inside it) shows its one
    // real record once this pass's own last record has settled on or after
    // it, `pending` before that.
    const record = run.nodes.find((n) => n.nodeId === node.nodeId);
    if (record && nodeRunSettledAt(record) <= passEnd) paint(node.nodeId, record);
    else statuses.set(node.nodeId, 'pending');
  }

  return { statuses, errors, settledPorts };
}

/** One node id's own accumulated run records — several only for a node that sat inside a loop body. */
export interface WorkflowNodeRunGroup {
  nodeId: string;
  runs: WorkflowNodeRun[];
}

/**
 * `run.nodes` grouped by node id (first-appearance order), each group's own
 * runs ordered `(iteration, settledAt)` — what the run output panel's Nodes
 * tab (Theme K) shows a looped node's history as, instead of one flat row
 * per record scattered across the array's own push order.
 */
export function nodeRunGroups(run: WorkflowRun): WorkflowNodeRunGroup[] {
  const order: string[] = [];
  const byNodeId = new Map<string, WorkflowNodeRun[]>();
  for (const node of run.nodes) {
    let bucket = byNodeId.get(node.nodeId);
    if (!bucket) {
      bucket = [];
      byNodeId.set(node.nodeId, bucket);
      order.push(node.nodeId);
    }
    bucket.push(node);
  }
  return order.map((nodeId) => ({ nodeId, runs: [...(byNodeId.get(nodeId) ?? [])].sort(byIterationThenSettledAt) }));
}
