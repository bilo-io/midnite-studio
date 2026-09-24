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
export const WORKFLOW_NODE_KINDS = [
  'http',
  'transform',
  'condition',
  'delay',
  'note',
  'agent',
  'script',
] as const;
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

// --- ports & edge kinds (Phase 97 Theme A) ------------------------------------

/**
 * What a port carries. `'any'` is the wildcard both directions accept;
 * `'verdict'` is the maker/checker signal Theme E's verifier (and the
 * existing `MIDNITE_WORKFLOW_NODE_DONE` marker) settle on, connectable to a
 * `'boolean'` in-port so a `condition`-shaped consumer can read it without a
 * transform node between them (see {@link canConnect}). `'artifact-ref'`
 * names a produced file/output by reference rather than inlining it, for the
 * built-in templates (Theme L) that pass an agent's output along without
 * re-embedding it at every hop.
 */
export const WORKFLOW_PORT_TYPES = [
  'any',
  'json',
  'text',
  'number',
  'boolean',
  'verdict',
  'artifact-ref',
] as const;
export const WorkflowPortTypeSchema = z.enum(WORKFLOW_PORT_TYPES);
export type WorkflowPortType = z.infer<typeof WorkflowPortTypeSchema>;

/**
 * A small JSON-shape descriptor — deliberately not full JSON Schema (Decision
 * 4 in the phase doc). It says "an object with these keys" or "an array of
 * X", nothing about formats, patterns or unions. `properties`/`items` are
 * themselves shapes, so a couple of levels of nesting (an http response's
 * `{items: [{id, title}]}`) is expressible; anything deeper is what
 * `'json'`/`'any'` ports are for.
 */
export type WorkflowPortShape = {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
  properties?: Record<string, WorkflowPortShape>;
  items?: WorkflowPortShape;
};

export const WorkflowPortShapeSchema: z.ZodType<WorkflowPortShape> = z.lazy(() =>
  z.object({
    type: z.enum(['string', 'number', 'boolean', 'object', 'array', 'any']),
    properties: z.record(z.string(), WorkflowPortShapeSchema).optional(),
    items: WorkflowPortShapeSchema.optional(),
  }),
);

/**
 * One connection point on a node, as computed by {@link portsForNode} —
 * **never persisted on the node itself**, so a kind's port list can change (a
 * config field renamed, a router case added) without a migration; only the
 * edges that reference a port id need one ({@link migrateWorkflowEdges}).
 */
export const WorkflowPortSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  direction: z.enum(['in', 'out']),
  type: WorkflowPortTypeSchema,
  /** Out-port only — what an agent/script/http node's config can pin (below), read by {@link canConnect}'s shape check. */
  outputShape: WorkflowPortShapeSchema.optional(),
  /**
   * In-port only. `true` for every plain node's implicit `in` port below,
   * which already behaves as an all-parents join today — Kahn scheduling in
   * `workflow-engine.ts` waits on every incoming edge regardless of how many
   * land on it — so restricting it here would break existing and future
   * fan-in graphs that don't need a `join` node's `any`/`allSettled`
   * semantics (Theme B). Left unset for a port meant to take exactly one
   * edge (a future single-consumer `in`, or one of a join's distinctly-`id`d
   * `in-1`/`in-2`/… ports, which don't need this flag because each is its
   * own id).
   */
  allowMultiple: z.boolean().optional(),
});
export type WorkflowPort = z.infer<typeof WorkflowPortSchema>;

/**
 * Every node kind with an executor gets this out-port implicitly (`note` —
 * canvas furniture with no executor — gets none). Its payload is always
 * `{message, status}`, declared as the port's own `outputShape` in
 * {@link portsForNode} so a downstream `{{...}}` hint can name `message`
 * without the node's config saying anything about it.
 */
export const WORKFLOW_ERROR_PORT_ID = 'error';

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
  /**
   * Overrides {@link WORKFLOW_NODE_TIMEOUT_MS} for this node, bounded at
   * {@link WORKFLOW_MAX_NODE_TIMEOUT_MS}.
   *
   * Bounded for the same reason `delay.ms` is: unbounded, a mistyped
   * `86400000` parks a run for a day — and while it runs, deleting that
   * workflow is refused as "still running" and the run only ends at quit.
   */
  timeoutMs: z.number().int().positive().max(600_000).optional(),
  /** Pins this node's `out` port shape (Theme A) — optional, read by {@link portsForNode}. */
  outputShape: WorkflowPortShapeSchema.optional(),
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

/**
 * The sentinel line {@link agentNodeDonePrompt} asks the agent to print once
 * it has fully finished the node's task — `executors/agent.ts`'s own
 * completion signal, alongside activity reaching idle (Theme J's resolved
 * "agent node done detection" decision: activity-idle alone is ambiguous for
 * an agent paused on a question of its own). `:ok`/`:fail` is how the agent
 * reports its own outcome; a bare marker with neither suffix reads as `ok`,
 * so an agent whose skill has not been taught the `:fail` form still
 * completes the node rather than hanging it to the outer per-node deadline.
 */
export const WORKFLOW_AGENT_DONE_MARKER = 'MIDNITE_WORKFLOW_NODE_DONE';

/** `/(ok|fail)/` capture group, tolerant of surrounding text on the same line. */
export const WORKFLOW_AGENT_DONE_MARKER_PATTERN = new RegExp(
  `${WORKFLOW_AGENT_DONE_MARKER}(?::\\s*(ok|fail))?`,
);

/**
 * The instruction appended to an agent node's own prompt — never sent to the
 * shell on its own, always as the tail of {@link WorkflowAgentConfig.prompt}.
 * Separated into its own function (rather than inlined in the executor) so a
 * test can assert the exact wording the agent is told, once.
 */
export function agentNodeDonePrompt(prompt: string): string {
  return `${prompt}\n\nWhen you have completely finished this task, print a line containing exactly "${WORKFLOW_AGENT_DONE_MARKER}: ok" (or "${WORKFLOW_AGENT_DONE_MARKER}: fail" if you could not complete it), then stop.`;
}

/**
 * An **agent** node (Phase 95 Theme J) — runs the named roster agent
 * headless-free, interactively, in a real pty (`executors/agent.ts`), with
 * `prompt` extended by {@link agentNodeDonePrompt}. `model` is free text
 * (the agent's own `--model` flag, when it has one) rather than a per-agent
 * enum — `shared/src/ai-models.ts` (Theme E) already covers the wand/planner's
 * cheap-model case; a workflow node's model choice is a different axis
 * (interactive session, not headless) and reuses that registry only for its
 * option list in the renderer, not for its shape here.
 */
export const WorkflowAgentConfigSchema = z.object({
  /** A `BUILTIN_AGENTS`/roster id, e.g. `'claude'` — validated against the roster at run time, not parse time (the roster is a runtime fact about the host, not a property of the saved workflow). */
  agentId: z.string().default(''),
  prompt: z.string().default(''),
  model: z.string().optional(),
  /** Pins this node's `out` port shape (Theme A) — optional, read by {@link portsForNode}. */
  outputShape: WorkflowPortShapeSchema.optional(),
});
export type WorkflowAgentConfig = z.infer<typeof WorkflowAgentConfigSchema>;

/**
 * A **script** node (Phase 95 Theme J) — runs `command` in a real pty
 * (`executors/script.ts`), exactly like a plain shell session, and settles on
 * the shell's own exit status (`; exit $?`, `council-runner.ts`'s own
 * pattern). `cwd` is optional because workflows are global, not per-repo (this
 * module's own doc comment) — unset runs from the OS home directory, the same
 * fallback `council-runner.ts`'s one-shot ptys use.
 */
export const WorkflowScriptConfigSchema = z.object({
  command: z.string().default(''),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).default({}),
  /** Pins this node's `out` port shape (Theme A) — optional, read by {@link portsForNode}. */
  outputShape: WorkflowPortShapeSchema.optional(),
});
export type WorkflowScriptConfig = z.infer<typeof WorkflowScriptConfigSchema>;

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
  WorkflowNodeBaseSchema.extend({
    kind: z.literal('agent'),
    config: WorkflowAgentConfigSchema,
  }),
  WorkflowNodeBaseSchema.extend({
    kind: z.literal('script'),
    config: WorkflowScriptConfigSchema,
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
  /**
   * The editor's own pause switch (Phase 95 Theme I, midnite's "enabled"
   * toggle). Left `optional()` rather than `.default(true)` on purpose — a
   * `.default()` would make it a *required* field on the inferred `Workflow`
   * type, and every existing `Workflow` object literal across this package's
   * (and `desktop`'s) tests would need updating for a field their fixtures
   * never cared about. `isWorkflowEnabled` below is the one place that reads
   * "missing" as "on", so every pre-Theme-I workflow keeps running exactly as
   * it does today, and nothing here forces a migration pass.
   */
  enabled: z.boolean().optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type Workflow = z.infer<typeof WorkflowSchema>;

/** `enabled` unset (every workflow saved before Theme I) reads as on. */
export function isWorkflowEnabled(workflow: Pick<Workflow, 'enabled'>): boolean {
  return workflow.enabled !== false;
}

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
  /**
   * A `condition` node whose predicate did not hold.
   *
   * Its own field rather than a status, because the node itself ran and
   * answered — marking it `skipped` would claim the step never happened, which
   * is the opposite of what a false predicate means. What it gates is
   * everything *downstream*, which the engine then marks `skipped`.
   */
  gatedDownstream: z.boolean().default(false),
  error: z.string().optional(),
  startedAt: z.number().int().nonnegative().optional(),
  endedAt: z.number().int().nonnegative().optional(),
  /**
   * The `TerminalSession` an `agent`/`script` node ran in (Phase 95 Theme J) —
   * unset for every other kind, and unset for an agent/script node too until
   * its pty actually exists (a node the driver never reached, or one whose
   * session failed to start at all). This is what lets the terminal
   * accordion group and the canvas node's live glow find "this node's own
   * session" without re-deriving it from `TerminalSession.workflowRunRef`
   * on every render — the run already has it once the executor stamps it.
   */
  sessionId: z.string().min(1).optional(),
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
    if (node.kind === 'agent' && node.config.agentId.trim() === '') {
      issues.push({ message: `"${node.label}" has no agent selected.`, nodeId: node.id });
    }
    if (node.kind === 'agent' && node.config.prompt.trim() === '') {
      issues.push({ message: `"${node.label}" has no prompt.`, nodeId: node.id });
    }
    if (node.kind === 'script' && node.config.command.trim() === '') {
      issues.push({ message: `"${node.label}" has no command.`, nodeId: node.id });
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
    const pair = `${edge.from}:${edge.to}`;
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

// --- cycle detection -----------------------------------------------------------

/**
 * Kahn's algorithm, run for its *remainder* rather than its order — shared by
 * `workflow-engine.ts` (which refuses to start a cyclic run) and the canvas
 * (which refuses to draw a cyclic edge), **so the two cannot disagree about
 * what a cycle is.** Living in `shared` rather than duplicated in `desktop`
 * and `app` is what makes that true: `app` may not import `desktop`, and this
 * is the one piece of the engine's cycle check that both sides need.
 *
 * A non-empty remainder after the queue drains **is** a cycle; the first edge
 * found among the remaining nodes is the one worth naming.
 *
 * Dangling edge endpoints (a `from`/`to` not in `nodeIds`) are ignored here —
 * that is {@link validateWorkflow}'s concern, not this function's.
 */
export function findCycleEdge(
  nodeIds: readonly string[],
  edges: readonly Pick<WorkflowEdge, 'id' | 'from' | 'to'>[],
): WorkflowEdge | null {
  const known = new Set(nodeIds);
  const children = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  const inDegree = new Map<string, number>(nodeIds.map((id) => [id, 0]));

  for (const edge of edges) {
    if (!known.has(edge.from) || !known.has(edge.to)) continue;
    children.get(edge.from)!.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const queue = nodeIds.filter((id) => (inDegree.get(id) ?? 0) === 0);
  let settled = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    settled += 1;
    for (const child of children.get(id) ?? []) {
      const next = (inDegree.get(child) ?? 0) - 1;
      inDegree.set(child, next);
      if (next === 0) queue.push(child);
    }
  }

  if (settled === nodeIds.length) return null;
  const stuck = new Set(nodeIds.filter((id) => (inDegree.get(id) ?? 0) > 0));
  return (
    (edges as WorkflowEdge[]).find((edge) => stuck.has(edge.from) && stuck.has(edge.to)) ?? null
  );
}

/**
 * Would adding `candidate` create a cycle, without actually adding it?
 *
 * The canvas's edge-drag preview calls this on every pointer move over a
 * candidate target port, so it stays a cheap Kahn pass over the existing
 * edges plus one — no id required on the candidate, since the algorithm only
 * ever reads `from`/`to`.
 */
export function wouldCycle(
  edges: readonly WorkflowEdge[],
  nodeIds: readonly string[],
  candidate: { from: string; to: string },
): boolean {
  return findCycleEdge(nodeIds, [...edges, { id: '__candidate__', ...candidate }]) !== null;
}

/**
 * Every node id upstream of `nodeId` — its transitive predecessors — sharing
 * the parent-map traversal shape {@link findCycleEdge} builds, but walking
 * `from`s instead of settling an in-degree queue. Used by the node inspector
 * (Theme F) to list which upstream nodes' output a `{{...}}` reference may
 * legally name; a workflow mid-edit can be cyclic, so this does not assume an
 * acyclic graph — a node reachable only through a cycle back to itself is
 * still excluded, since `nodeId` itself is never added to the result.
 */
export function ancestorIds(
  nodeId: string,
  edges: readonly Pick<WorkflowEdge, 'from' | 'to'>[],
): Set<string> {
  const parentsOf = new Map<string, string[]>();
  for (const edge of edges) {
    if (!parentsOf.has(edge.to)) parentsOf.set(edge.to, []);
    parentsOf.get(edge.to)!.push(edge.from);
  }

  const seen = new Set<string>();
  const stack = [...(parentsOf.get(nodeId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id) || id === nodeId) continue;
    seen.add(id);
    stack.push(...(parentsOf.get(id) ?? []));
  }
  return seen;
}

// --- tunables ----------------------------------------------------------------

/**
 * Per-node deadline. Matches `COUNCIL_RUN_TIMEOUT_MS` and `process-runner.ts`'s
 * `DEFAULT_TIMEOUT_MS` rather than inventing a third number; overridable per
 * node through an `http` node's `config.timeoutMs`.
 */
export const WORKFLOW_NODE_TIMEOUT_MS = 120_000;

/**
 * Ceiling on a per-node override — ten minutes.
 *
 * Enforced in {@link WorkflowHttpConfigSchema} rather than only in the
 * executor, so a bad value fails to parse instead of parking a run.
 */
export const WORKFLOW_MAX_NODE_TIMEOUT_MS = 600_000;

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

/**
 * `TerminalSession.repoId` for an agent/script node's session (Phase 95 Theme
 * J). Workflows are global, not per-repo (this module's own doc comment), so
 * there is no real repo id to stamp — this sentinel is what lets the schema's
 * `repoId: z.string().min(1)` stay satisfied without inventing a fake repo,
 * and what `sessions-view.tsx` filters OUT of the ordinary by-repo grouping
 * (a workflow-run session is grouped by `workflowRunRef` instead — see
 * `groupSessionsByWorkflowRun`).
 */
export const WORKFLOW_SESSION_REPO_ID = 'workflow';
