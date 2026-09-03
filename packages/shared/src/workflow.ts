/**
 * Workflows (Phase 43): a directed graph of nodes you build on a canvas, run,
 * and watch light up node by node.
 *
 * **Name collision, deliberate.** `workflow` already means *GitHub Actions
 * workflow* in this codebase — `ForgeWorkflowSchema` in `domain/forge.ts`, the
 * whole `features/actions/` tree. These are unrelated concepts. Everything in
 * this module is named `Workflow*` with no `Forge` prefix, and no module
 * imports both without a comment saying why.
 *
 * Workflows are **global**, not per-repo, exactly like councils — nothing here
 * touches git, so there is nothing for a repository to scope. The MVP's node
 * vocabulary is exactly five kinds and its centre of gravity is HTTP; see the
 * phase doc for why (a workflow engine with nothing to call is a diagram).
 *
 * Runs are **manual only**. No cron, no webhook ingress, no file-watch
 * triggers: a workflow runs because someone pressed Run.
 */
import { z } from 'zod';

// --- node kinds --------------------------------------------------------------

/**
 * The MVP's whole node vocabulary.
 *
 * Written as a closed list feeding a discriminated union rather than an open
 * string, so adding node #6 — an agent node is the obvious next one — is an
 * honest schema change with a compile error at every exhaustive `Record` rather
 * than a value quietly slotting into a union nobody widened on purpose.
 */
export const WORKFLOW_NODE_KINDS = ['http', 'transform', 'condition', 'delay', 'note'] as const;
export type WorkflowNodeKind = (typeof WORKFLOW_NODE_KINDS)[number];

/**
 * The HTTP verbs an `http` node can send.
 *
 * `QUERY` is **not** in this list and never will be: it is not a wire method.
 * The feature note's "QUERY" verb is a `GET` whose `params` are serialised into
 * the query string, expressed as {@link WorkflowHttpConfigSchema}'s
 * `queryShaped` flag — so `method` always holds something `fetch` can actually
 * put on the wire.
 */
export const WORKFLOW_HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as const;
export const WorkflowHttpMethodSchema = z.enum(WORKFLOW_HTTP_METHODS);
export type WorkflowHttpMethod = z.infer<typeof WorkflowHttpMethodSchema>;

// --- node configs ------------------------------------------------------------

export const WorkflowHttpConfigSchema = z.object({
  method: WorkflowHttpMethodSchema,
  /** May contain `{{nodeId.path}}` references — see `interpolate.ts`. */
  url: z.string(),
  headers: z.record(z.string(), z.string()).default({}),
  /** Serialised into the query string. Meaningful on any method, required by `queryShaped`. */
  params: z.record(z.string(), z.string()).default({}),
  /** Raw request body, sent as-is after interpolation. Never set on GET/HEAD. */
  body: z.string().optional(),
  /**
   * The feature note's "QUERY" verb: a `GET` that carries its arguments as
   * query params. A flag rather than a seventh `method` value so `method`
   * stays a real wire method — a reader would otherwise go looking for QUERY
   * in an RFC.
   */
  queryShaped: z.boolean().default(false),
  /** Overrides {@link WORKFLOW_NODE_TIMEOUT_MS} for this node. */
  timeoutMs: z.number().int().positive().optional(),
});
export type WorkflowHttpConfig = z.infer<typeof WorkflowHttpConfigSchema>;

/**
 * One `from` → `to` rename/pick. `from` is a `{{...}}`-style dotted path
 * resolved against upstream outputs; `to` is a plain key in this node's output
 * object. No JS evaluation — that is a sandbox question this phase does not
 * open.
 */
export const WorkflowTransformPickSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});
export type WorkflowTransformPick = z.infer<typeof WorkflowTransformPickSchema>;

export const WorkflowTransformConfigSchema = z.object({
  picks: z.array(WorkflowTransformPickSchema).default([]),
});
export type WorkflowTransformConfig = z.infer<typeof WorkflowTransformConfigSchema>;

export const WORKFLOW_CONDITION_OPS = [
  'eq',
  'ne',
  'lt',
  'lte',
  'gt',
  'gte',
  'contains',
  'empty',
] as const;
export const WorkflowConditionOpSchema = z.enum(WORKFLOW_CONDITION_OPS);
export type WorkflowConditionOp = z.infer<typeof WorkflowConditionOpSchema>;

export const WorkflowConditionConfigSchema = z.object({
  /** Interpolated before comparison; usually `{{nodeId.path}}`. */
  left: z.string(),
  op: WorkflowConditionOpSchema,
  /** Absent for the unary `empty`. */
  right: z.string().optional(),
});
export type WorkflowConditionConfig = z.infer<typeof WorkflowConditionConfigSchema>;

/**
 * Bounded at a minute in the schema, not just in the executor: a mistyped
 * `600000` must fail to parse rather than park a run for ten minutes.
 */
export const WORKFLOW_DELAY_MAX_MS = 60_000;

export const WorkflowDelayConfigSchema = z.object({
  ms: z.number().int().min(0).max(WORKFLOW_DELAY_MAX_MS),
});
export type WorkflowDelayConfig = z.infer<typeof WorkflowDelayConfigSchema>;

export const WorkflowNoteConfigSchema = z.object({
  text: z.string().default(''),
});
export type WorkflowNoteConfig = z.infer<typeof WorkflowNoteConfigSchema>;

// --- nodes -------------------------------------------------------------------

/**
 * What every node kind carries regardless of what it does.
 *
 * `x`/`y` are plain floats, deliberately **not** integers or grid cells: the
 * canvas snaps on drop for tidiness, but a workflow imported with fractional
 * positions must still parse.
 */
export const WorkflowNodeBaseSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  x: z.number(),
  y: z.number(),
});

export const WorkflowNodeSchema = z.discriminatedUnion('kind', [
  WorkflowNodeBaseSchema.extend({
    kind: z.literal('http'),
    config: WorkflowHttpConfigSchema,
  }),
  WorkflowNodeBaseSchema.extend({
    kind: z.literal('transform'),
    config: WorkflowTransformConfigSchema,
  }),
  WorkflowNodeBaseSchema.extend({
    kind: z.literal('condition'),
    config: WorkflowConditionConfigSchema,
  }),
  WorkflowNodeBaseSchema.extend({
    kind: z.literal('delay'),
    config: WorkflowDelayConfigSchema,
  }),
  WorkflowNodeBaseSchema.extend({
    kind: z.literal('note'),
    config: WorkflowNoteConfigSchema,
  }),
]);
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

export const WorkflowEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
});
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;

export const WorkflowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  nodes: z.array(WorkflowNodeSchema),
  edges: z.array(WorkflowEdgeSchema),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type Workflow = z.infer<typeof WorkflowSchema>;

// --- runs --------------------------------------------------------------------

/**
 * Six states, not five.
 *
 * `timeout` is its own outcome rather than folded into `failed` because the
 * per-node deadline produces exactly that and it is the one distinction the UI
 * most needs to explain — `council.ts`'s member states carry it for the same
 * reason. `skipped` is what a node downstream of a failure, a timeout, or a
 * false `condition` reaches, and what a cancel leaves un-started nodes in.
 */
export const WorkflowNodeStatusSchema = z.enum([
  'pending',
  'running',
  'succeeded',
  'failed',
  'timeout',
  'skipped',
]);
export type WorkflowNodeStatus = z.infer<typeof WorkflowNodeStatusSchema>;

export const WorkflowRunStatusSchema = z.enum(['running', 'completed', 'failed', 'cancelled']);
export type WorkflowRunStatus = z.infer<typeof WorkflowRunStatusSchema>;

/**
 * One node's result within a run.
 *
 * `kind`/`label` are a **snapshot** taken at run start, not a live read of the
 * workflow's current nodes — editing a node's label after a run has finished
 * never rewrites that run's history. The same guarantee Phase 34 gave a
 * council member, for the same reason.
 *
 * `output` is whatever the executor produced, as parsed JSON-ish data. It is
 * `unknown` on the wire because each kind produces its own shape (an `http`
 * node's `{status, headers, body, durationMs}`, a `transform`'s picked object);
 * narrowing it per kind would mean a second discriminated union that only ever
 * gets read as data.
 */
export const WorkflowNodeRunSchema = z.object({
  nodeId: z.string().min(1),
  kind: z.enum(WORKFLOW_NODE_KINDS),
  label: z.string().min(1),
  status: WorkflowNodeStatusSchema,
  output: z.unknown().optional(),
  /** Set when the captured output hit the per-node cap and was cut off. */
  truncated: z.boolean().default(false),
  error: z.string().optional(),
  startedAt: z.number().int().nonnegative().optional(),
  endedAt: z.number().int().nonnegative().optional(),
});
export type WorkflowNodeRun = z.infer<typeof WorkflowNodeRunSchema>;

/**
 * A single run of a workflow.
 *
 * **`nodes` and `edges` are frozen at run start.** The whole run object is
 * built and persisted before the first node launches, and the engine executes
 * from `run.nodes`/`run.edges`, never from the live workflow — so editing the
 * graph mid-run cannot rewrite what is already in flight, and cannot leave the
 * run referring to an edge that no longer exists.
 *
 * Nothing runtime-only reaches this shape: abort controllers, timer handles and
 * in-flight promises live in a side map keyed by `id`, the same rule
 * `council-service.ts` applies to a member's `ptyId`.
 */
export const WorkflowRunSchema = z.object({
  id: z.string().min(1),
  workflowId: z.string().min(1),
  /** Snapshot of the workflow's name at run start, so history reads right after a rename. */
  workflowName: z.string().min(1),
  status: WorkflowRunStatusSchema,
  nodes: z.array(WorkflowNodeRunSchema),
  edges: z.array(WorkflowEdgeSchema),
  error: z.string().optional(),
  startedAt: z.number().int().nonnegative(),
  endedAt: z.number().int().nonnegative().optional(),
});
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;

// --- validation --------------------------------------------------------------

/**
 * One thing wrong with a workflow, beyond what zod can express.
 *
 * A separate pass rather than a `.superRefine` on {@link WorkflowSchema}
 * because a half-built workflow must still **save** — you draw a node, walk
 * away, and come back to it. What an issue blocks is running, not persisting.
 * `nodeId`/`edgeId` are what lets the canvas point at the offending element
 * rather than showing a paragraph.
 */
export const WorkflowIssueSchema = z.object({
  message: z.string().min(1),
  nodeId: z.string().min(1).optional(),
  edgeId: z.string().min(1).optional(),
});
export type WorkflowIssue = z.infer<typeof WorkflowIssueSchema>;

/**
 * Everything that makes a workflow unrunnable, in one pure function shared by
 * the engine (which refuses to start) and the canvas (which disables Run and
 * names the offender).
 *
 * Cycles are **not** checked here — that is the engine's Kahn pass, which has
 * the in-degree map in hand anyway, and reporting it needs the same traversal.
 * This function is the cheap structural check that can run on every keystroke.
 */
export function validateWorkflow(workflow: Workflow): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];
  const ids = new Set<string>();

  for (const node of workflow.nodes) {
    if (ids.has(node.id)) issues.push({ message: `Duplicate node id "${node.id}".`, nodeId: node.id });
    ids.add(node.id);

    if (node.kind === 'http' && node.config.url.trim() === '') {
      issues.push({ message: `"${node.label}" has no URL.`, nodeId: node.id });
    }
    if (node.kind === 'transform' && node.config.picks.length === 0) {
      issues.push({ message: `"${node.label}" picks no fields.`, nodeId: node.id });
    }
    if (node.kind === 'condition' && node.config.op !== 'empty' && node.config.right === undefined) {
      issues.push({
        message: `"${node.label}" compares with "${node.config.op}" but has no right-hand value.`,
        nodeId: node.id,
      });
    }
  }

  const seenEdges = new Set<string>();
  for (const edge of workflow.edges) {
    if (!ids.has(edge.from)) {
      issues.push({ message: `An edge starts at a node that no longer exists.`, edgeId: edge.id });
    }
    if (!ids.has(edge.to)) {
      issues.push({ message: `An edge ends at a node that no longer exists.`, edgeId: edge.id });
    }
    if (edge.from === edge.to) {
      issues.push({ message: `A node cannot connect to itself.`, edgeId: edge.id });
    }
    const pair = `${edge.from} ${edge.to}`;
    if (seenEdges.has(pair)) {
      issues.push({ message: `Duplicate connection between the same two nodes.`, edgeId: edge.id });
    }
    seenEdges.add(pair);
    // A `note` is canvas furniture with no executor: an edge into or out of one
    // would join a branch that can never produce or consume anything.
    for (const end of [edge.from, edge.to]) {
      if (workflow.nodes.find((n) => n.id === end)?.kind === 'note') {
        issues.push({ message: `A note cannot be connected — it is a label, not a step.`, edgeId: edge.id });
      }
    }
  }

  if (workflow.nodes.every((node) => node.kind === 'note')) {
    issues.push({ message: 'This workflow has nothing to run.' });
  }

  return issues;
}

// --- tunables ----------------------------------------------------------------

/**
 * Per-node deadline. Matches `COUNCIL_RUN_TIMEOUT_MS` and `process-runner.ts`'s
 * `DEFAULT_TIMEOUT_MS` rather than inventing a third number; overridable per
 * node through an `http` node's `config.timeoutMs`.
 */
export const WORKFLOW_NODE_TIMEOUT_MS = 120_000;

/**
 * Nodes in flight at once, across the whole run.
 *
 * Mirrors `search-service.ts`'s `SEARCH_CEILING = 4`. A twenty-node fan-out
 * firing twenty simultaneous `fetch`es is a self-inflicted rate limit against
 * whatever it is calling.
 */
export const WORKFLOW_NODE_CONCURRENCY = 4;

/**
 * Retained runs **per workflow**, oldest evicted.
 *
 * Per-workflow rather than one global cap so a workflow you run in a loop
 * cannot evict the history of one you run twice a week — the case a flat cap
 * gets wrong, and the reason the number here is much smaller than
 * `MAX_STORED_LOOP_RUNS`.
 */
export const MAX_STORED_WORKFLOW_RUNS_PER_WORKFLOW = 20;
