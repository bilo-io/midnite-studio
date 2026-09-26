import { z } from 'zod';

import {
  WorkflowGateDecidedBySchema,
  WorkflowGateDecisionSchema,
  WorkflowLoopExitReasonSchema,
  nodeRunSettledAt,
  type WorkflowNode,
  type WorkflowNodeKind,
  type WorkflowRun,
} from './workflow';

/**
 * The "change receipt" a completed workflow run writes onto its
 * [Phase 94](../../../.midnite/tasks/phases/phase-94-ai-engineering.md) Theme
 * A `AgentRun` projection (Phase 97 Theme K) — every field the phase doc's
 * own checklist names, and **no cost field**, per Phase 94 Decision 8 (the
 * app cannot honestly see an agent's token use).
 *
 * Assembled by {@link buildWorkflowRunReceipt}, a pure function over a
 * `WorkflowRun` (the frozen run record) and, optionally, the workflow's own
 * `WorkflowNode[]` (the live/frozen graph, for the handful of fields a run
 * record alone cannot answer — see that function's own doc comment for
 * exactly which fields need it).
 */
export const WorkflowReceiptVerdictSchema = z.object({
  nodeId: z.string().min(1),
  label: z.string().min(1),
  check: z.string().min(1),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  message: z.string(),
});
export type WorkflowReceiptVerdict = z.infer<typeof WorkflowReceiptVerdictSchema>;

/**
 * Per-loop-edge iteration tally, from `WorkflowRun.loopStates` verbatim.
 *
 * **Known gap, deliberately not closed here**: the phase doc's own checklist
 * also asks for "retries" alongside loop iterations. A node's own
 * `onFailure: {kind:'retry'}` attempts (Theme G) are NOT persisted anywhere
 * on `WorkflowNodeRun`/`WorkflowRun` — `workflow-engine.ts`'s own doc comment
 * for `executeNode` says so explicitly ("an in-between failed attempt is not
 * itself a checkpoint-worthy event"). There is nothing for a pure function
 * over the run record to read, and adding that bookkeeping would mean
 * changing `workflow-engine.ts`, which is outside this theme's own
 * checklist. So this only ever reports loop-edge iterations.
 */
export const WorkflowReceiptLoopIterationSchema = z.object({
  edgeId: z.string().min(1),
  iterations: z.number().int().min(1),
  exitReason: WorkflowLoopExitReasonSchema.optional(),
});
export type WorkflowReceiptLoopIteration = z.infer<typeof WorkflowReceiptLoopIterationSchema>;

/**
 * One `gate` node's recorded decision (Theme D's `output`, verbatim).
 *
 * **Known gap, left alone deliberately**: a policy-governed node's *implicit*
 * approval (Theme I) leaves no such record on the governed node's own run —
 * Theme I's own board note calls this out of its scope, and closing it would
 * mean adding new bookkeeping to `workflow-engine.ts`, which is not in this
 * theme's own checklist either. So `humanDecisions` only ever lists explicit
 * `gate` nodes.
 */
export const WorkflowReceiptDecisionSchema = z.object({
  nodeId: z.string().min(1),
  label: z.string().min(1),
  decision: WorkflowGateDecisionSchema,
  decidedBy: WorkflowGateDecidedBySchema,
  note: z.string().nullable(),
  at: z.number().int().nonnegative().optional(),
});
export type WorkflowReceiptDecision = z.infer<typeof WorkflowReceiptDecisionSchema>;

export const WorkflowRunReceiptSchema = z.object({
  contextSources: z.object({
    /** `frame` node ids whose Contract/Context slots actually reached a contained `agent` node that ran. `[]` when `workflowNodes` was not supplied to {@link buildWorkflowRunReceipt}. */
    frameIds: z.array(z.string()),
    /** The `trigger` node's own settled output — `null` for a manual run or a workflow with no trigger node. */
    triggerPayload: z.unknown(),
  }),
  /** A stable hash over every `policy` node's `{allow, requireApprovalFor}` — `''` when the run has none. */
  policyVersion: z.string(),
  /** Distinct kinds that produced a real record, first-appearance order. */
  nodeKinds: z.array(z.string()),
  /** Distinct roster agent ids referenced by a node config that ran. `[]` when `workflowNodes` was not supplied. */
  agentsUsed: z.array(z.string()),
  verifierVerdicts: z.array(WorkflowReceiptVerdictSchema),
  loopIterations: z.array(WorkflowReceiptLoopIterationSchema),
  humanDecisions: z.array(WorkflowReceiptDecisionSchema),
  wallClockMs: z.number().int().nonnegative(),
  /** The last node (by `(iteration, settledAt)`) to settle with a real output — `null` for a run with nothing settled yet. */
  acceptedArtifact: z.object({ nodeId: z.string().min(1), label: z.string().min(1), output: z.unknown() }).nullable(),
  /**
   * The repo HEAD sha at trigger time, when the run has a repo — a
   * passthrough only. `WorkflowRun`/`WorkflowSchema` carry no repoId/HEAD
   * anywhere, and `shared` cannot call git-engine to resolve one, so this
   * pure function never computes it itself; the caller supplies it (or
   * leaves it `null`, same as "the run has no repo").
   */
  rollbackPoint: z.string().nullable(),
});
export type WorkflowRunReceipt = z.infer<typeof WorkflowRunReceiptSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * A small, order-independent hash — not cryptographic, just stable and cheap
 * — over a policy's own `{allow, requireApprovalFor}` output. Good enough to
 * answer "did the effective policy change between two runs of the same
 * workflow", which is all `policyVersion` is for.
 */
function hashPolicyOutputs(outputs: unknown[]): string {
  if (outputs.length === 0) return '';
  const sorted = outputs
    .map((output) => JSON.stringify(output, Object.keys(isRecord(output) ? output : {}).sort()))
    .sort();
  let hash = 0;
  for (const line of sorted.join('\n')) {
    hash = (hash * 31 + line.charCodeAt(0)) | 0;
  }
  return (hash >>> 0).toString(16);
}

/** Every roster agent id a node config that actually ran declared, deduped, in node order. */
function agentsUsedFrom(nodeIds: ReadonlySet<string>, workflowNodes: readonly WorkflowNode[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (agentId: string | undefined) => {
    if (!agentId || seen.has(agentId)) return;
    seen.add(agentId);
    ids.push(agentId);
  };
  for (const node of workflowNodes) {
    if (!nodeIds.has(node.id)) continue;
    if (node.kind === 'agent') add(node.config.agentId || undefined);
    else if (node.kind === 'verify' && node.config.check === 'agent') add(node.config.agentId || undefined);
    else if (node.kind === 'router' && node.config.mode === 'agent-label') add(node.config.agent?.agentId || undefined);
  }
  return ids;
}

/** `frame` node ids that governed a contained `agent` node which actually ran. */
function frameIdsFrom(nodeIds: ReadonlySet<string>, workflowNodes: readonly WorkflowNode[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const node of workflowNodes) {
    if (node.kind !== 'agent' || !node.frameId || !nodeIds.has(node.id) || seen.has(node.frameId)) continue;
    seen.add(node.frameId);
    ids.push(node.frameId);
  }
  return ids;
}

/**
 * Projects a completed (or in-flight) workflow run into its own
 * {@link WorkflowRunReceipt}. Pure — no store, no Electron, no clock other
 * than `Date.now()` for an in-flight run's `wallClockMs` — so a vitest
 * fixture is the whole test.
 *
 * `workflowNodes` is optional because a run record alone (`WorkflowRun`)
 * already answers most of the receipt: `trigger`/`policy`/`verify`/`gate`
 * node kinds all stamp what this needs straight onto their own run record's
 * `output` (Themes H/I/E/D respectively). Only `contextSources.frameIds` and
 * `agentsUsed` need the live graph — `frameId` and `agentId` live on the
 * `WorkflowNode` config, never on a `WorkflowNodeRun` — and read as `[]`
 * without it, same as every other optional-plus-reader field in this phase.
 */
export function buildWorkflowRunReceipt(
  run: WorkflowRun,
  workflowNodes?: readonly WorkflowNode[],
  extra: { rollbackPoint?: string | null } = {},
): WorkflowRunReceipt {
  const settledNodeIds = new Set(run.nodes.map((node) => node.nodeId));

  const nodeKinds: WorkflowNodeKind[] = [];
  const seenKinds = new Set<WorkflowNodeKind>();
  for (const node of run.nodes) {
    if (seenKinds.has(node.kind)) continue;
    seenKinds.add(node.kind);
    nodeKinds.push(node.kind);
  }

  const triggerNode = run.nodes.find((node) => node.kind === 'trigger');
  const policyOutputs = run.nodes.filter((node) => node.kind === 'policy').map((node) => node.output);

  const verifierVerdicts = run.nodes
    .filter((node) => node.kind === 'verify' && isRecord(node.output))
    .map((node) => {
      const evidence = node.output as { check?: unknown; passed?: unknown; failed?: unknown; message?: unknown };
      return {
        nodeId: node.nodeId,
        label: node.label,
        check: typeof evidence.check === 'string' ? evidence.check : 'unknown',
        passed: typeof evidence.passed === 'number' ? evidence.passed : 0,
        failed: typeof evidence.failed === 'number' ? evidence.failed : 0,
        message: typeof evidence.message === 'string' ? evidence.message : '',
      };
    });

  const loopIterations = (run.loopStates ?? []).map((state) => ({
    edgeId: state.edgeId,
    iterations: state.iteration,
    exitReason: state.exitReason,
  }));

  const humanDecisions = run.nodes
    .filter((node) => node.kind === 'gate' && isRecord(node.output))
    .map((node) => {
      const decided = node.output as { decision?: unknown; note?: unknown; decidedBy?: unknown };
      return {
        nodeId: node.nodeId,
        label: node.label,
        decision: decided.decision === 'approved' ? ('approved' as const) : ('rejected' as const),
        decidedBy: WorkflowGateDecidedBySchema.safeParse(decided.decidedBy).success
          ? (decided.decidedBy as WorkflowReceiptDecision['decidedBy'])
          : ('panel' as const),
        note: typeof decided.note === 'string' ? decided.note : null,
        at: node.endedAt,
      };
    });

  // Real chronological order, NOT `(iteration, settledAt)` — "the last node
  // output" means the last thing that actually happened in wall-clock time.
  // A node downstream of a multi-pass loop (iteration unset, reads as 1) can
  // easily settle after a later loop iteration (iteration 2+) chronologically
  // while sorting "before" it under an iteration-primary key — exactly the
  // built-in templates' own shape (loop → exhausted → human gate → ship). See
  // `nodeRunSettledAt`'s own doc comment and the p97 board's Theme K note.
  const settled = [...run.nodes]
    .filter((node) => node.output !== undefined)
    .sort((a, b) => nodeRunSettledAt(a) - nodeRunSettledAt(b) || a.nodeId.localeCompare(b.nodeId));
  const lastSettled = settled.length > 0 ? settled[settled.length - 1] : undefined;

  return {
    contextSources: {
      frameIds: workflowNodes ? frameIdsFrom(settledNodeIds, workflowNodes) : [],
      triggerPayload: triggerNode?.output ?? null,
    },
    policyVersion: hashPolicyOutputs(policyOutputs),
    nodeKinds,
    agentsUsed: workflowNodes ? agentsUsedFrom(settledNodeIds, workflowNodes) : [],
    verifierVerdicts,
    loopIterations,
    humanDecisions,
    wallClockMs: (run.endedAt ?? Date.now()) - run.startedAt,
    acceptedArtifact: lastSettled ? { nodeId: lastSettled.nodeId, label: lastSettled.label, output: lastSettled.output } : null,
    rollbackPoint: extra.rollbackPoint ?? null,
  };
}
