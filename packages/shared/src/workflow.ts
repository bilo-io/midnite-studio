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

import { WORKFLOW_TEST_COUNT_PARSERS } from './workflow-test-parsers';

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
  'join',
  'gate',
  'router',
  'verify',
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

/**
 * Added to a node's ports (Theme C) only when it is a loop edge's source —
 * see {@link portsForNode}'s `edges` parameter. Taken by a non-`'converged'`
 * loop exit ({@link WorkflowLoopExitReason}); typically wired to Theme D's
 * human gate as the escalation path.
 */
export const WORKFLOW_LOOP_EXHAUSTED_PORT_ID = 'exhausted';

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
 * `{{...}}` interpolation roots the engine reserves for synthetic data that is
 * never a node's recorded output: `demo` (Theme M — `{{demo.baseUrl}}`, the
 * demo API's URL), `loop` (Theme C — `{{loop.iteration}}` and friends inside a
 * controlled cycle) and `state` (Theme G — `{{state.<key>}}` durable run
 * state). Declared once, here in `shared`, so `validateWorkflow` below can
 * reject a node id that collides with one — the actual injection of each
 * namespace into a run's `upstream` record happens per-theme at the engine's
 * own call site (`workflow-engine.ts`'s `runNode`), never in this file.
 */
export const WORKFLOW_RESERVED_INTERPOLATION_ROOTS = ['demo', 'loop', 'state'] as const;
export type WorkflowReservedInterpolationRoot = (typeof WORKFLOW_RESERVED_INTERPOLATION_ROOTS)[number];

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

/**
 * A **join** node (Phase 97 Theme B) — the explicit merge point for a
 * fan-out, when the implicit "all parents" behaviour every plain node's `in`
 * port already has (Theme A) is not what's wanted: a different join mode, or
 * a distinct output shape to reference downstream.
 *
 * `inputs` is a declared **count**, not a list — the canvas draws `in-1`
 * through `in-N` and the user wires however many of them matter; an unwired
 * port is simply absent from the run (see the engine's `joinPortStates`).
 * Bounded the same way `WORKFLOW_DELAY_MAX_MS` is: a join is a merge point,
 * not a general-purpose N-ary op, so a canvas that wants more than eight
 * branches probably wants two joins.
 */
export const WORKFLOW_JOIN_MODES = ['all', 'any', 'allSettled'] as const;
export const WorkflowJoinModeSchema = z.enum(WORKFLOW_JOIN_MODES);
export type WorkflowJoinMode = z.infer<typeof WorkflowJoinModeSchema>;

export const WORKFLOW_JOIN_MIN_INPUTS = 2;
export const WORKFLOW_JOIN_MAX_INPUTS = 8;

export const WorkflowJoinConfigSchema = z.object({
  mode: WorkflowJoinModeSchema.default('all'),
  inputs: z
    .number()
    .int()
    .min(WORKFLOW_JOIN_MIN_INPUTS)
    .max(WORKFLOW_JOIN_MAX_INPUTS)
    .default(WORKFLOW_JOIN_MIN_INPUTS),
});
export type WorkflowJoinConfig = z.infer<typeof WorkflowJoinConfigSchema>;

// --- gate (Phase 97 Theme D) ---------------------------------------------------

/**
 * A gate's two out-ports — settled exactly like `condition`'s `true`/`false`
 * (Theme B's `settledPort` convention): approval is not a failure, it is an
 * ordinary branch. `WorkflowGateDecisionSchema` doubles as the decide IPC/MCP
 * tool's own input, so the wire vocabulary and the port ids can never drift
 * apart from each other.
 */
export const WORKFLOW_GATE_DECISIONS = ['approved', 'rejected'] as const;
export const WorkflowGateDecisionSchema = z.enum(WORKFLOW_GATE_DECISIONS);
export type WorkflowGateDecision = z.infer<typeof WorkflowGateDecisionSchema>;

/**
 * Which of the four surfaces (Decision 5 in the phase doc) actually decided a
 * gate — carried on the settled node's own output so the run panel/replay can
 * say "approved via MCP" rather than just "approved". `'cancelled'` is not a
 * real decision a human or tool made; it is what a cancelled run's own poll
 * writes into the same field for a consistent output shape (never read as a
 * `settledPort`, which stays whatever B's per-edge cascade already computed
 * for a `failed` node).
 */
export const WORKFLOW_GATE_DECIDED_BY = ['panel', 'mcp', 'pr-comment', 'timeout', 'cancelled'] as const;
export const WorkflowGateDecidedBySchema = z.enum(WORKFLOW_GATE_DECIDED_BY);
export type WorkflowGateDecidedBy = z.infer<typeof WorkflowGateDecidedBySchema>;

/**
 * A gate posts one PR/issue comment carrying this shape — `kind`/`repoId`
 * mirror `ForgeIssue`'s own addressing rather than a `Forge` value, because a
 * workflow is global (this module's own doc comment) and has no repository
 * of its own to resolve one from; `repoId` is the app's own registered-repo
 * id (`RepoDescriptor.id`), the same id `git-safety`/kill-switch scopes key
 * on. The forge remote itself is resolved from that repo, at decide time, by
 * `gate-forge-service.ts` — never persisted here.
 */
export const WorkflowGateLinkedRefSchema = z.object({
  kind: z.enum(['pr', 'issue']),
  repoId: z.string().min(1),
  number: z.number().int().positive(),
});
export type WorkflowGateLinkedRef = z.infer<typeof WorkflowGateLinkedRefSchema>;

/**
 * A **gate** node (Phase 97 Theme D) — the run pauses here (`WorkflowNodeRun.status`
 * turns `'waiting'`) until a human or tool decides `approved`/`rejected`, from
 * any of four surfaces: the run panel, the notification bell, an MCP tool, or
 * — when `linkedRef` is set — a `/midnite approve <token>`/`/midnite reject
 * <token>` comment on that PR/issue from the account that owns the forge
 * credential the gate posted with.
 *
 * `onTimeout` is a closed `'reject'` literal rather than a boolean or a wider
 * enum — Decision 5's own resolution names auto-reject as the one timeout
 * behaviour; a silent auto-approve would be the one outcome a human gate must
 * never produce on its own.
 */
export const WorkflowGateConfigSchema = z.object({
  title: z.string().default(''),
  instructions: z.string().default(''),
  /** Bounded the same way `WorkflowHttpConfig.timeoutMs` is (Decision: six hours as a sane outer bound — `WORKFLOW_LOOP_MAX_BUDGET_MS` below is the identical ceiling Theme C already chose for "generous but still a real ceiling on a mistyped budget"). Unset waits forever (until decided or the run is cancelled). */
  timeoutMs: z.number().int().positive().max(21_600_000).optional(),
  onTimeout: z.literal('reject').default('reject'),
  linkedRef: WorkflowGateLinkedRefSchema.optional(),
});
export type WorkflowGateConfig = z.infer<typeof WorkflowGateConfigSchema>;

// --- router (Phase 97 Theme F) ------------------------------------------------

export const WORKFLOW_ROUTER_MODES = ['expression', 'agent-label'] as const;
export const WorkflowRouterModeSchema = z.enum(WORKFLOW_ROUTER_MODES);
export type WorkflowRouterMode = z.infer<typeof WorkflowRouterModeSchema>;

/** The fixed out-port every router has beyond its own cases — see {@link portsForNode}. Not a config field: it always exists, the same way {@link WORKFLOW_ERROR_PORT_ID} always exists. */
export const WORKFLOW_ROUTER_DEFAULT_PORT_ID = 'default';

/** A sane ceiling on how many named routes one node can fan out to — the same "bounded, not unlimited" discipline `WORKFLOW_JOIN_MAX_INPUTS` already applies to a join's inputs. */
export const WORKFLOW_ROUTER_MAX_CASES = 12;

/**
 * One named route. `when` is the "condition-shaped `{left, op, right}`" the
 * phase doc names for **expression** mode — evaluated in array order, first
 * match wins ({@link WorkflowRouterConfigSchema}'s own doc comment). Optional
 * because **agent-label** mode never reads it (the embedded agent chooses
 * among case `id`s instead); a case missing `when` while in expression mode
 * is flagged by {@link validateWorkflow}, the same way a `condition` node
 * missing its right-hand value already is.
 */
export const WorkflowRouterCaseSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  when: WorkflowConditionConfigSchema.optional(),
});
export type WorkflowRouterCase = z.infer<typeof WorkflowRouterCaseSchema>;

/**
 * A **router** node (Phase 97 Theme F) — one out-port per declared case, plus
 * the always-present {@link WORKFLOW_ROUTER_DEFAULT_PORT_ID}. Two ways to pick
 * a route:
 *
 * - `'expression'`: the first case whose `when` holds wins (reusing
 *   `WORKFLOW_CONDITION_OPS` and `condition.ts`'s own evaluator — see
 *   `evaluateWorkflowCondition`). No case matching (or none configured with a
 *   `when` at all) settles on `default`.
 * - `'agent-label'`: `agent` is an embedded agent config (Phase 95 Theme J's
 *   own `WorkflowAgentConfigSchema`, reused rather than a second shape) whose
 *   done marker is extended to name one of this router's own case **ids**
 *   (`executors/router.ts`'s `WORKFLOW_ROUTER_DONE_MARKER_PATTERN`) — a
 *   closed, deterministic vocabulary the classifier picks from, never free
 *   text it invents. An id the agent prints that names no configured case
 *   routes to `default` — this is the article's "the classifier is
 *   probabilistic, the allowed routes are deterministic": a hallucinated
 *   label must never be guessed into the nearest case.
 */
export const WorkflowRouterConfigSchema = z.object({
  mode: WorkflowRouterModeSchema.default('expression'),
  cases: z.array(WorkflowRouterCaseSchema).max(WORKFLOW_ROUTER_MAX_CASES).default([]),
  /** `'agent-label'` mode only — unset (or incomplete) is flagged by {@link validateWorkflow}, same as a plain `agent` node with no agent/prompt. */
  agent: WorkflowAgentConfigSchema.optional(),
});
export type WorkflowRouterConfig = z.infer<typeof WorkflowRouterConfigSchema>;

// --- verify (Phase 97 Theme E) ------------------------------------------------

/**
 * A **verify** node — the phase doc's "checker that is not the maker": one
 * comparison over four kinds of evidence, settling on its `pass`/`fail`
 * out-port (never a failure in itself — see {@link portsForNodeKind}'s
 * `'verify'` case and the doc comment on {@link WorkflowVerifyEvidence}).
 *
 * `agent`/`exit-code`/`test-counts` each embed just enough of the
 * corresponding node's own config to run the check standalone — a verify
 * node has no upstream node to borrow a config from (an agent node's DONE
 * marker only means "that node finished", not "check this"), so the check
 * config is self-contained rather than a reference.
 */
export const WORKFLOW_VERIFY_CHECKS = ['agent', 'exit-code', 'test-counts', 'json-path'] as const;
export const WorkflowVerifyCheckSchema = z.enum(WORKFLOW_VERIFY_CHECKS);
export type WorkflowVerifyCheck = z.infer<typeof WorkflowVerifyCheckSchema>;

/**
 * The maker/checker verdict: an embedded agent, run exactly like an `agent`
 * node (Phase 95 Theme J's roster + done-marker machinery,
 * `executors/verify.ts` reusing `executors/agent.ts`'s
 * `runAgentToDoneMarker`), whose `MIDNITE_WORKFLOW_NODE_DONE: ok|fail`
 * marker becomes the `pass`/`fail` verdict directly rather than an executor
 * failure.
 */
export const WorkflowVerifyAgentCheckSchema = z.object({
  check: z.literal('agent'),
  agentId: z.string().default(''),
  prompt: z.string().default(''),
  model: z.string().optional(),
});
export type WorkflowVerifyAgentCheck = z.infer<typeof WorkflowVerifyAgentCheckSchema>;

/**
 * Same `{command, cwd, env}` shape as {@link WorkflowScriptConfigSchema}
 * (minus `outputShape`, which a check has no use for), but run **headlessly**
 * — `process-runner.ts`, not a `script` node's interactive pty — so the
 * exit code and stdout are clean signal rather than a terminal transcript.
 */
export const WorkflowVerifyExitCodeCheckSchema = z.object({
  check: z.literal('exit-code'),
  command: z.string().default(''),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).default({}),
});
export type WorkflowVerifyExitCodeCheck = z.infer<typeof WorkflowVerifyExitCodeCheckSchema>;

/**
 * The same headless run as `exit-code`, plus a named `parser` for the
 * command's stdout ({@link WORKFLOW_TEST_COUNT_PARSERS},
 * `workflow-test-parsers.ts`) yielding `{passed, failed, skipped}`. Passes
 * when `failed === 0 && passed >= minPassed` — a suite with zero tests
 * collected (a typo'd filter, a broken config) is **not** a pass by default;
 * `minPassed: 0` opts back into that if a template genuinely wants it.
 */
export const WorkflowVerifyTestCountsCheckSchema = z.object({
  check: z.literal('test-counts'),
  command: z.string().default(''),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).default({}),
  parser: z.enum(WORKFLOW_TEST_COUNT_PARSERS),
  minPassed: z.number().int().min(0).default(1),
});
export type WorkflowVerifyTestCountsCheck = z.infer<typeof WorkflowVerifyTestCountsCheckSchema>;

/**
 * A `condition`-shaped comparison against a single interpolated value —
 * reuses {@link WORKFLOW_CONDITION_OPS} and `executors/condition.ts`'s own
 * comparison (`evaluateConditionOp`), so a verify node's json-path check and
 * a plain `condition` node can never disagree about what `'gte'` means.
 */
export const WorkflowVerifyJsonPathCheckSchema = z.object({
  check: z.literal('json-path'),
  /** Usually `{{nodeId.path}}` — interpolated before comparison. */
  source: z.string(),
  op: WorkflowConditionOpSchema,
  /** Absent for the unary `empty`. */
  right: z.string().optional(),
});
export type WorkflowVerifyJsonPathCheck = z.infer<typeof WorkflowVerifyJsonPathCheckSchema>;

export const WorkflowVerifyConfigSchema = z.discriminatedUnion('check', [
  WorkflowVerifyAgentCheckSchema,
  WorkflowVerifyExitCodeCheckSchema,
  WorkflowVerifyTestCountsCheckSchema,
  WorkflowVerifyJsonPathCheckSchema,
]);
export type WorkflowVerifyConfig = z.infer<typeof WorkflowVerifyConfigSchema>;

/** Evidence is capped this many failures deep — the same order of magnitude as `loop.failures`' own cap. */
export const WORKFLOW_VERIFY_MAX_FAILURES = 20;

/**
 * A verify node's own `output` — what `{{verifyNodeId.path}}` resolves
 * against downstream, and, when this node sits inside a loop body, exactly
 * what Theme C's `buildLoopContext` turns into `{{loop.failures}}` for the
 * next iteration (see `loop-controller.ts`'s `isFailure` check, extended for
 * a verify node's `'fail'` `settledPort`). `failures` is capped at
 * {@link WORKFLOW_VERIFY_MAX_FAILURES} and redacted (`redactPaths`) by the
 * executor before it ever reaches an interpolated prompt — the same
 * discipline `loop.failures` itself already applies.
 */
export type WorkflowVerifyEvidence = {
  check: WorkflowVerifyCheck;
  passed: number;
  failed: number;
  message: string;
  failures: string[];
};

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
  WorkflowNodeBaseSchema.extend({
    kind: z.literal('join'),
    config: WorkflowJoinConfigSchema,
  }),
  WorkflowNodeBaseSchema.extend({
    kind: z.literal('gate'),
    config: WorkflowGateConfigSchema,
  }),
  WorkflowNodeBaseSchema.extend({
    kind: z.literal('router'),
    config: WorkflowRouterConfigSchema,
  }),
  WorkflowNodeBaseSchema.extend({
    kind: z.literal('verify'),
    config: WorkflowVerifyConfigSchema,
  }),
]);
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

/** Every executor-bearing kind's single, always-present, all-parents-join in-port. */
function inPort(): WorkflowPort {
  return { id: 'in', label: 'In', direction: 'in', type: 'any', allowMultiple: true };
}

function dataOutPort(id: string, label: string, outputShape?: WorkflowPortShape): WorkflowPort {
  return { id, label, direction: 'out', type: 'json', ...(outputShape ? { outputShape } : {}) };
}

function errorPort(): WorkflowPort {
  return {
    id: WORKFLOW_ERROR_PORT_ID,
    label: 'Error',
    direction: 'out',
    type: 'json',
    outputShape: {
      type: 'object',
      properties: { message: { type: 'string' }, status: { type: 'number' } },
    },
  };
}

/**
 * A node kind's connection points, computed fresh from the node (never
 * persisted — see {@link WorkflowPortSchema}'s doc comment). Most kinds are
 * static; `condition` is the phase doc's own worked example of settling on a
 * named out-port instead of a single `out`. Exhaustive over
 * {@link WorkflowNodeKind} — adding a kind is a compile error here until this
 * switch is widened on purpose, the same discipline `WORKFLOW_NODE_KINDS`
 * already asks for.
 *
 * `edges` (Theme C) is optional and additive only — every pre-Theme-C call
 * site (the canvas's own port lookups, Theme A's tests) still works with a
 * bare `portsForNode(node)`. When passed, and `node` is the source of a
 * `kind: 'loop'` edge, the {@link WORKFLOW_LOOP_EXHAUSTED_PORT_ID} out-port is
 * appended — it does not exist on a node with no outgoing loop edge, which is
 * what stops it cluttering every node kind that never loops.
 */
export function portsForNode(node: WorkflowNode, edges?: readonly WorkflowEdge[]): WorkflowPort[] {
  const ports = portsForNodeKind(node);
  const isLoopSource = edges?.some((edge) => edge.from === node.id && normalizeEdge(edge).kind === 'loop');
  if (isLoopSource) {
    ports.push({ id: WORKFLOW_LOOP_EXHAUSTED_PORT_ID, label: 'Exhausted', direction: 'out', type: 'any' });
  }
  return ports;
}

function portsForNodeKind(node: WorkflowNode): WorkflowPort[] {
  switch (node.kind) {
    case 'http':
      return [inPort(), dataOutPort('out', 'Response', node.config.outputShape), errorPort()];
    case 'transform':
      return [inPort(), dataOutPort('out', 'Output'), errorPort()];
    case 'condition':
      return [
        inPort(),
        { id: 'true', label: 'True', direction: 'out', type: 'any' },
        { id: 'false', label: 'False', direction: 'out', type: 'any' },
        errorPort(),
      ];
    case 'delay':
      return [inPort(), { id: 'out', label: 'Out', direction: 'out', type: 'any' }, errorPort()];
    case 'note':
      // Canvas furniture with no executor — validateWorkflow already refuses
      // any edge touching one.
      return [];
    case 'agent':
      return [inPort(), dataOutPort('out', 'Output', node.config.outputShape), errorPort()];
    case 'script':
      return [inPort(), dataOutPort('out', 'Output', node.config.outputShape), errorPort()];
    case 'join': {
      const inputs: WorkflowPort[] = [];
      for (let i = 1; i <= node.config.inputs; i += 1) {
        inputs.push({ id: `in-${i}`, label: `In ${i}`, direction: 'in', type: 'any' });
      }
      // `allSettled` is the one mode whose output isn't just "the merged
      // value" — it's a fulfilled/rejected split (Promise.allSettled's own
      // shape), so only it pins an outputShape here.
      const outputShape: WorkflowPortShape | undefined =
        node.config.mode === 'allSettled'
          ? {
              type: 'object',
              properties: {
                fulfilled: { type: 'array', items: { type: 'any' } },
                rejected: { type: 'array', items: { type: 'any' } },
              },
            }
          : undefined;
      return [...inputs, dataOutPort('out', 'Joined', outputShape), errorPort()];
    }
    case 'gate':
      return [
        inPort(),
        { id: 'approved', label: 'Approved', direction: 'out', type: 'any' },
        { id: 'rejected', label: 'Rejected', direction: 'out', type: 'any' },
        errorPort(),
      ];
    case 'router':
      return [
        inPort(),
        ...node.config.cases.map(
          (routerCase): WorkflowPort => ({
            id: routerCase.id,
            label: routerCase.label,
            direction: 'out',
            type: 'any',
          }),
        ),
        { id: WORKFLOW_ROUTER_DEFAULT_PORT_ID, label: 'Default', direction: 'out', type: 'any' },
        errorPort(),
      ];
    case 'verify':
      // `verdict` (Theme A), not `json` — a downstream `condition`-shaped
      // in-port can read `pass`/`fail` directly (`canConnect`'s
      // `verdict -> boolean` allowance), no transform node needed between
      // a verifier and a branch on its result.
      return [
        inPort(),
        { id: 'pass', label: 'Pass', direction: 'out', type: 'verdict' },
        { id: 'fail', label: 'Fail', direction: 'out', type: 'verdict' },
        errorPort(),
      ];
    default: {
      // Unreachable while `WorkflowNodeKind` is exhaustive; the assignment is
      // what makes adding a kind a typecheck failure here.
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}

export const WORKFLOW_EDGE_KINDS = ['data', 'conditional', 'loop', 'error'] as const;
export const WorkflowEdgeKindSchema = z.enum(WORKFLOW_EDGE_KINDS);
export type WorkflowEdgeKind = z.infer<typeof WorkflowEdgeKindSchema>;

// --- controlled cycles (Phase 97 Theme C) -------------------------------------

/**
 * A `loop` edge's bounds are mandatory — there is no such thing as an
 * unbounded back-edge (Decision 3). `maxIterations` is a hard cap on the
 * article's "6 iterations"; `budgetMs` is the wall-clock twin ("2 dry rounds
 * or 6 iterations" — whichever bound is hit first wins). There is
 * deliberately no token/cost field: Phase 94 Decision 8 covers why the app
 * cannot honestly see an agent's token use.
 */
export const WORKFLOW_LOOP_MAX_ITERATIONS = 20;

/** Six hours — generous, but still a real ceiling on a mistyped budget. */
export const WORKFLOW_LOOP_MAX_BUDGET_MS = 6 * 60 * 60 * 1000;

/**
 * How a loop decides it has nothing more to gain from another pass, short of
 * hitting a bound. `dry-rounds` is the Graph Engineering article's "2 dry
 * rounds" — `rounds` consecutive iterations whose `keyPath` value (resolved
 * against the loop SOURCE node's own output, the same node the edge is
 * attached to) repeats one already seen, rejected iterations included. Its
 * dedupe state lives on {@link WorkflowLoopState}, not here, because it
 * accumulates across iterations rather than describing the edge itself.
 * `until-port` is the simpler alternative: converged the moment the source's
 * output carries a truthy field named `port`.
 */
export const WorkflowLoopConvergenceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('dry-rounds'),
    rounds: z.number().int().min(1).max(10),
    keyPath: z.string().min(1),
  }),
  z.object({
    kind: z.literal('until-port'),
    port: z.string().min(1),
  }),
]);
export type WorkflowLoopConvergence = z.infer<typeof WorkflowLoopConvergenceSchema>;

export const WorkflowLoopConfigSchema = z.object({
  maxIterations: z.number().int().min(1).max(WORKFLOW_LOOP_MAX_ITERATIONS),
  budgetMs: z.number().int().min(1).max(WORKFLOW_LOOP_MAX_BUDGET_MS),
  convergence: WorkflowLoopConvergenceSchema.optional(),
});
export type WorkflowLoopConfig = z.infer<typeof WorkflowLoopConfigSchema>;

/**
 * Every way a loop stops. Only `'converged'` is a happy stop — a loop that
 * got what it needed before running out of room. The other three all take
 * the loop source's `exhausted` out-port (see {@link WORKFLOW_LOOP_EXHAUSTED_PORT_ID}),
 * which is typically wired to a human gate (Theme D) as the escalation path.
 */
export const WORKFLOW_LOOP_EXIT_REASONS = ['converged', 'max-iterations', 'budget', 'cancelled'] as const;
export const WorkflowLoopExitReasonSchema = z.enum(WORKFLOW_LOOP_EXIT_REASONS);
export type WorkflowLoopExitReason = z.infer<typeof WorkflowLoopExitReasonSchema>;

/**
 * A loop's accumulated, persisted state for one run — one entry per loop edge
 * id, keyed that way (not by node id) because two distinct loop edges could
 * in principle share a source node. `startedAt` is stamped the first time the
 * loop's source node settles, not at run start, so `budgetMs` measures the
 * loop's own wall-clock rather than everything that ran before it got a
 * turn. `seenKeyHashes`/`dryStreak` are the dry-rounds dedupe state — kept
 * here rather than recomputed, so it survives a resume (Theme G) without
 * replaying every past iteration's output.
 */
export const WorkflowLoopStateSchema = z.object({
  edgeId: z.string().min(1),
  iteration: z.number().int().min(1),
  startedAt: z.number().int().nonnegative(),
  seenKeyHashes: z.array(z.string()).default([]),
  dryStreak: z.number().int().min(0).default(0),
  exitReason: WorkflowLoopExitReasonSchema.optional(),
});
export type WorkflowLoopState = z.infer<typeof WorkflowLoopStateSchema>;

export const WorkflowEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  /** Source port id (Theme A). Optional on the wire — {@link normalizeEdge} defaults it to `'out'`. */
  fromPort: z.string().min(1).optional(),
  /** Target port id (Theme A). Optional on the wire — {@link normalizeEdge} defaults it to `'in'`. */
  toPort: z.string().min(1).optional(),
  /** Optional on the wire — {@link normalizeEdge} defaults it to `'data'`. */
  kind: WorkflowEdgeKindSchema.optional(),
  /**
   * Mandatory in spirit, optional on the wire the same way `kind` is:
   * {@link validateWorkflow} is what actually enforces "a `loop`-kind edge
   * must carry this" (a zod-level `.superRefine` cannot see the sibling
   * `kind` field cleanly across a `.optional()` boundary without duplicating
   * the whole object shape). Meaningless when `kind !== 'loop'`.
   */
  loop: WorkflowLoopConfigSchema.optional(),
});
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;

/** An edge with every Theme A field's default filled in — never persisted this way, only read this way. */
export type NormalizedWorkflowEdge = WorkflowEdge & {
  fromPort: string;
  toPort: string;
  kind: WorkflowEdgeKind;
};

/**
 * Fills `fromPort`/`toPort`/`kind`'s defaults — the same optional-plus-reader
 * pattern {@link isWorkflowEnabled} uses, so every edge saved before Theme A
 * keeps meaning exactly what it meant: an unported `{id, from, to}` edge is a
 * plain `data` edge from `out` to `in`.
 */
export function normalizeEdge(edge: WorkflowEdge): NormalizedWorkflowEdge {
  return {
    ...edge,
    fromPort: edge.fromPort ?? 'out',
    toPort: edge.toPort ?? 'in',
    kind: edge.kind ?? 'data',
  };
}

const PORT_TYPE_COMPAT: Partial<Record<WorkflowPortType, readonly WorkflowPortType[]>> = {
  // The maker/checker verdict can drive a boolean-shaped consumer (a
  // `condition`-like in-port) directly — never the other way around, a plain
  // boolean carries no verdict evidence.
  verdict: ['boolean'],
};

function portTypesCompatible(from: WorkflowPortType, to: WorkflowPortType): boolean {
  if (from === 'any' || to === 'any' || from === to) return true;
  return PORT_TYPE_COMPAT[from]?.includes(to) ?? false;
}

function shapesCompatible(from?: WorkflowPortShape, to?: WorkflowPortShape): boolean {
  // Permissive unless *both* sides pinned a shape — an unpinned side has
  // nothing to conflict with (phase doc: "compatible when both sides declare one").
  if (!from || !to) return true;
  if (from.type === 'any' || to.type === 'any') return true;
  return from.type === to.type;
}

export type WorkflowConnectResult = { ok: true } | { ok: false; reason: string };

/**
 * Direction, type/shape compatibility, in-port multiplicity and
 * self-connection — everything {@link canConnect} and {@link canConnectLoop}
 * check identically. What differs between them is cycle handling alone,
 * which is why it is NOT in here; see each function's own doc comment.
 */
function canConnectPorts(
  fromNode: WorkflowNode,
  fromPort: WorkflowPort,
  toNode: WorkflowNode,
  toPort: WorkflowPort,
  edges: readonly WorkflowEdge[],
): WorkflowConnectResult {
  if (fromPort.direction !== 'out') {
    return { ok: false, reason: `"${fromPort.label}" is an in-port — a connection must start at an out-port.` };
  }
  if (toPort.direction !== 'in') {
    return { ok: false, reason: `"${toPort.label}" is an out-port — a connection must end at an in-port.` };
  }
  if (fromNode.id === toNode.id) {
    return { ok: false, reason: 'A node cannot connect to itself.' };
  }
  if (!portTypesCompatible(fromPort.type, toPort.type)) {
    return {
      ok: false,
      reason: `"${fromPort.label}" (${fromPort.type}) cannot connect to "${toPort.label}" (${toPort.type}).`,
    };
  }
  if (!shapesCompatible(fromPort.outputShape, toPort.outputShape)) {
    return {
      ok: false,
      reason: `"${fromPort.label}"'s output shape does not match what "${toPort.label}" expects.`,
    };
  }
  if (toPort.allowMultiple !== true) {
    const occupied = edges.some((edge) => {
      if (edge.to !== toNode.id) return false;
      return normalizeEdge(edge).toPort === toPort.id;
    });
    if (occupied) {
      return {
        ok: false,
        reason: `"${toPort.label}" already has a connection — only a multi-input port accepts more than one.`,
      };
    }
  }
  return { ok: true };
}

/**
 * The canvas connect-drag's gate for a **new** edge — direction, type and
 * shape compatibility, in-port multiplicity, self-connection, and
 * {@link wouldCycle}. It never re-validates an already-persisted edge (that
 * is {@link validateWorkflow}'s job), so a workflow saved before Theme A, or
 * one edited by a future theme that draws edges without going through the
 * canvas, is never retroactively broken by this function.
 *
 * Cycle-checking always runs here because this is the ordinary connect-drag
 * path, which never produces a `loop`-kind edge — a controlled back-edge
 * (Theme C) is drawn through its own affordance, {@link canConnectLoop}, not
 * this one.
 */
export function canConnect(
  fromNode: WorkflowNode,
  fromPort: WorkflowPort,
  toNode: WorkflowNode,
  toPort: WorkflowPort,
  edges: readonly WorkflowEdge[],
): WorkflowConnectResult {
  const base = canConnectPorts(fromNode, fromPort, toNode, toPort, edges);
  if (!base.ok) return base;
  const nodeIds = [...new Set([...edges.flatMap((edge) => [edge.from, edge.to]), fromNode.id, toNode.id])];
  if (wouldCycle(edges, nodeIds, { from: fromNode.id, to: toNode.id })) {
    return { ok: false, reason: 'That connection would create a cycle.' };
  }
  return { ok: true };
}

/**
 * The controlled-back-edge affordance (Theme C, Decision 3) — the ONE
 * deliberate exception to `canConnect`'s blanket cycle rejection. Identical
 * port checks to {@link canConnect} (direction, type/shape, multiplicity,
 * self-connection), but INVERTED cycle handling: a loop edge that does not
 * actually close a cycle back to an earlier node is the mistake here, not
 * the one this function exists to prevent. Cycle-closing is checked against
 * the NON-loop edges only — a loop edge closing a cycle with another loop
 * edge (rather than with the ordinary DAG) is not what this phase means by a
 * controlled back-edge, and {@link findAcyclicEdgeViolation} would not catch
 * it either.
 */
export function canConnectLoop(
  fromNode: WorkflowNode,
  fromPort: WorkflowPort,
  toNode: WorkflowNode,
  toPort: WorkflowPort,
  edges: readonly WorkflowEdge[],
): WorkflowConnectResult {
  const base = canConnectPorts(fromNode, fromPort, toNode, toPort, edges);
  if (!base.ok) return base;
  const nonLoopEdges = edges.filter((edge) => normalizeEdge(edge).kind !== 'loop');
  const nodeIds = [...new Set([...edges.flatMap((edge) => [edge.from, edge.to]), fromNode.id, toNode.id])];
  if (!wouldCycle(nonLoopEdges, nodeIds, { from: fromNode.id, to: toNode.id })) {
    return { ok: false, reason: 'A loop edge must close a cycle back to an earlier node.' };
  }
  return { ok: true };
}

/**
 * The cycle check that treats `kind: 'loop'` edges as the one legitimate
 * exception (Decision 3) — filters them out before delegating to
 * {@link findCycleEdge}, so a graph whose only cycle is closed by a
 * controlled loop edge reports no violation, while a cycle made purely of
 * `data`/`conditional`/`error` edges is still caught. This is what
 * `workflow-engine.ts`'s pre-run check calls instead of `findCycleEdge`
 * directly — `findCycleEdge` itself stays exactly as `canConnect` and the
 * canvas already use it, since neither of those ever needs to see a loop
 * edge as anything but a cycle (they reject all of them).
 */
export function findAcyclicEdgeViolation(
  nodeIds: readonly string[],
  edges: readonly WorkflowEdge[],
): WorkflowEdge | null {
  return findCycleEdge(
    nodeIds,
    edges.filter((edge) => normalizeEdge(edge).kind !== 'loop'),
  );
}

/**
 * The loop body: every node on a path from the loop edge's `to` (where
 * execution resumes) forward to its `from` (the decision node), inclusive of
 * both — computed over the non-loop edges only, so a nested/adjacent loop
 * edge never leaks into this one's body. The engine resets exactly this set
 * to a fresh `pending` record on every iteration ({@link WorkflowNodeRun.iteration}).
 */
export function loopBodyNodeIds(
  loopEdge: Pick<WorkflowEdge, 'from' | 'to'>,
  allEdges: readonly WorkflowEdge[],
): Set<string> {
  const nonLoopEdges = allEdges.filter((edge) => normalizeEdge(edge).kind !== 'loop');

  const forward = new Map<string, string[]>();
  for (const edge of nonLoopEdges) {
    if (!forward.has(edge.from)) forward.set(edge.from, []);
    forward.get(edge.from)!.push(edge.to);
  }
  const reachableFromTarget = new Set<string>([loopEdge.to]);
  const queue = [loopEdge.to];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const next of forward.get(id) ?? []) {
      if (reachableFromTarget.has(next)) continue;
      reachableFromTarget.add(next);
      queue.push(next);
    }
  }

  const backFromSource = ancestorIds(loopEdge.from, nonLoopEdges);
  backFromSource.add(loopEdge.from);

  const body = new Set<string>();
  for (const id of reachableFromTarget) {
    if (backFromSource.has(id)) body.add(id);
  }
  body.add(loopEdge.to);
  body.add(loopEdge.from);
  return body;
}

/**
 * Small, non-cryptographic, stable hash for dry-rounds dedupe
 * ({@link WorkflowLoopConvergence}'s `dry-rounds` variant) — FNV-1a. Just
 * enough to tell "have we seen this `keyPath` value before" apart from a
 * genuinely new one; not `node:crypto`, which `shared` cannot import (it
 * must stay browser-safe for `app`).
 */
export function hashLoopKey(value: unknown): string {
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/**
 * A tiny dotted-path walk against a loop source node's own output — what
 * `dry-rounds`' `keyPath` and `until-port`'s `port` resolve against.
 * Deliberately not `interpolate.ts`'s `{{...}}` grammar (no `{{}}`
 * delimiters, no node id — the loop source's own output is the only thing
 * either convergence rule ever reads) and never throws: an unresolvable
 * path is `undefined`, which {@link hashLoopKey} happily hashes as
 * `"undefined"` — a loop whose `keyPath` is wrong dedupes everything
 * together rather than crashing the run, which is the more recoverable
 * failure mode for a config mistake this far from the request that caused it.
 */
export function readLoopKeyPath(output: unknown, path: string): unknown {
  let current: unknown = output;
  for (const segment of path.split('.').filter((s) => s.length > 0)) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    if (Array.isArray(current)) {
      const index = Number.parseInt(segment, 10);
      current = Number.isInteger(index) && index >= 0 && index < current.length ? current[index] : undefined;
      continue;
    }
    current = Object.hasOwn(current, segment) ? (current as Record<string, unknown>)[segment] : undefined;
  }
  return current;
}

/** One earlier iteration's failure, as carried into `{{loop.failures}}`. */
export type WorkflowLoopFailure = { iteration: number; nodeId: string; message: string };

/**
 * The block an `agent` node's executor appends to its own prompt when
 * `{{loop.failures}}` is non-empty (the phase doc's "previous attempt failed
 * because…" requirement) — pure, so the wording is tested once here rather
 * than through a full pty fixture in `executors/agent.test.ts`.
 */
export function formatLoopFailuresBlock(failures: readonly WorkflowLoopFailure[]): string {
  if (failures.length === 0) return '';
  const lines = failures.map((f) => `- iteration ${f.iteration} (${f.nodeId}): ${f.message}`);
  return `\n\nPrevious attempt(s) in this loop failed:\n${lines.join('\n')}`;
}

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

/**
 * Run on load ({@link WorkflowsStore}'s `parseStoredWorkflows`, `desktop`) so
 * every persisted workflow carries edges Theme B's per-edge-readiness engine
 * can read directly.
 *
 * A pre-Theme-A `condition` node's outgoing edges had no port at all — they
 * fired whenever the run reached them, and a false predicate gated
 * everything downstream via `WorkflowNodeRun.gatedDownstream`. Theme B moved
 * the engine onto reading `fromPort`/`settledPort` instead — `gatedDownstream`
 * stays on the schema only so a pre-Theme-B run's history still parses, and
 * nothing writes it `true` again. Without this migration, an edge with no
 * `fromPort` would look like an unconditional `out` edge — taken every time,
 * true or false. So this migration sets the one thing that preserves the old
 * behaviour exactly: a legacy condition edge's `fromPort` becomes `'true'`,
 * so it is only ever taken when the condition settles true, same as before.
 *
 * **Identity for every other workflow.** An edge that already has a
 * `fromPort`, or whose source is not a `condition` node, is returned
 * untouched — and if nothing in the workflow needed migrating, the same
 * `Workflow` reference comes back, not a shallow copy. This is what makes
 * "old workflows execute exactly as today" a fact about the function, not
 * just an intention.
 */
export function migrateWorkflowEdges(workflow: Workflow): Workflow {
  const nodesById = new Map(workflow.nodes.map((node) => [node.id, node]));
  let changed = false;

  const edges = workflow.edges.map((edge) => {
    if (edge.fromPort !== undefined) return edge;
    if (nodesById.get(edge.from)?.kind !== 'condition') return edge;
    changed = true;
    return { ...edge, fromPort: 'true', kind: edge.kind ?? 'conditional' };
  });

  return changed ? { ...workflow, edges } : workflow;
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
 *
 * `waiting` (Phase 97 Theme D) is a **gate** node's own paused state — reached
 * from `running` (`workflow-engine.ts`'s `patchNodeWaiting`, the same
 * mid-flight-patch idiom `patchNodeSessionId` already uses) and left only by a
 * decide reaching the node, or the run being cancelled. Deliberately **not**
 * terminal: the run itself stays `running` and every downstream edge reads
 * `pending` (`edgeState`) for as long as the gate sits here, which is the
 * whole mechanism that makes a run actually pause rather than just LOOK
 * paused. It carries no extra field of its own — `WorkflowNodeRun.status`
 * being `'waiting'` *is* the durable "this run is paused for approval" fact,
 * and it already round-trips through `workflow-runs-store.ts` for free.
 */
export const WorkflowNodeStatusSchema = z.enum([
  'pending',
  'running',
  'succeeded',
  'failed',
  'timeout',
  'skipped',
  'waiting',
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
  /**
   * The out-port this node actually settled on (Phase 97 Theme B) — `'out'`
   * for a plain success, `'true'`/`'false'` for a condition, `'error'` for a
   * failure/timeout routed through a wired error edge. Unset for `skipped`,
   * for a `pending`/`running` node, and for a failure/timeout with **no**
   * error edge — that last case is deliberate: it is what tells the engine's
   * cascade "this node produced nothing routable", which is the exact
   * legacy behaviour {@link migrateWorkflowEdges}'s doc comment describes.
   * What the engine's per-edge readiness pass (`workflow-engine.ts`) reads to
   * decide whether an edge was *taken* or *dead*, and what replay (Theme K)
   * and the canvas (Theme J) highlight the taken path from.
   *
   * **Theme C overrides this** on a loop source's non-`converged` stop (to
   * `'exhausted'`) and on a `converged` stop with a single alternate
   * out-port — `loop-controller.ts`'s `evaluateLoopSettle`, applied by
   * `workflow-engine.ts`'s `settleNode` after the computation above. This is
   * the ONLY loop-specific routing signal; a `loop`-kind edge never enters
   * the per-edge readiness pass at all (see `buildGraph`'s doc comment in
   * `workflow-engine.ts`).
   */
  settledPort: z.string().min(1).optional(),
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
  /**
   * Which pass through a loop body this record is for (Theme C). Unset for
   * every pre-Theme-C run and every node that never sits inside a loop —
   * read as `1` via {@link nodeRunIteration}, the same optional-plus-reader
   * pattern {@link isWorkflowEnabled} uses. A looping node accumulates
   * MULTIPLE entries in `WorkflowRun.nodes` sharing this `nodeId`, one per
   * iteration and never overwritten — see `loop-controller.ts`'s
   * `activeNodeRun`/`activeNodeRuns` for "the current one".
   */
  iteration: z.number().int().min(1).optional(),
  /**
   * Set on the loop source's record for the iteration where a loop actually
   * stopped (as opposed to one that simply never looped). Mirrors
   * `WorkflowLoopState.exitReason`, but scoped to this one settle rather
   * than the loop as a whole — Theme K's replay-by-iteration reads this to
   * find the exact iteration an escalation happened on.
   */
  loopExit: WorkflowLoopExitReasonSchema.optional(),
});
export type WorkflowNodeRun = z.infer<typeof WorkflowNodeRunSchema>;

/** Unset (every pre-Theme-C record) reads as iteration 1. */
export function nodeRunIteration(nodeRun: Pick<WorkflowNodeRun, 'iteration'>): number {
  return nodeRun.iteration ?? 1;
}

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
  /**
   * Per-loop-edge bookkeeping (Theme C) — unset for every pre-Theme-C run
   * and every run with no loop edge, read as `[]` via
   * {@link workflowLoopStates}. Theme G's resume and Theme K's replay both
   * build on this, so keep the shape stable — see {@link WorkflowLoopState}.
   */
  loopStates: z.array(WorkflowLoopStateSchema).optional(),
});
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;

/** Unset (every pre-Theme-C run, and every run with no loop edge yet reached) reads as `[]`. */
export function workflowLoopStates(run: Pick<WorkflowRun, 'loopStates'>): WorkflowLoopState[] {
  return run.loopStates ?? [];
}

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
/**
 * Optional on the wire, defaulting to `'error'` via {@link workflowIssueSeverity}
 * — the same optional-plus-reader pattern {@link isWorkflowEnabled} uses, so
 * every issue this function produced before Theme E stays exactly as
 * blocking as it always was. `'warning'` is for something worth surfacing
 * that must NOT stop Run — Theme E's own maker == checker check is the first
 * of these; the engine (`workflow-engine.ts`) and the canvas
 * (`workflows-view.tsx`) both filter to error-severity issues before
 * deciding whether a workflow can run.
 */
export const WorkflowIssueSeveritySchema = z.enum(['error', 'warning']);
export type WorkflowIssueSeverity = z.infer<typeof WorkflowIssueSeveritySchema>;

export const WorkflowIssueSchema = z.object({
  message: z.string().min(1),
  nodeId: z.string().min(1).optional(),
  edgeId: z.string().min(1).optional(),
  severity: WorkflowIssueSeveritySchema.optional(),
});
export type WorkflowIssue = z.infer<typeof WorkflowIssueSchema>;

/** Unset (every issue produced before Theme E) reads as `'error'` — the blocking default. */
export function workflowIssueSeverity(issue: Pick<WorkflowIssue, 'severity'>): WorkflowIssueSeverity {
  return issue.severity ?? 'error';
}

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

    if ((WORKFLOW_RESERVED_INTERPOLATION_ROOTS as readonly string[]).includes(node.id)) {
      issues.push({
        message: `"${node.label}" cannot use the reserved id "${node.id}" — {{${node.id}...}} is reserved for the engine.`,
        nodeId: node.id,
      });
    }

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
    if (node.kind === 'gate' && node.config.title.trim() === '') {
      issues.push({ message: `"${node.label}" has no title.`, nodeId: node.id });
    }
    if (
      node.kind === 'join' &&
      !workflow.edges.some((edge) => edge.to === node.id && normalizeEdge(edge).toPort.startsWith('in-'))
    ) {
      issues.push({ message: `"${node.label}" has nothing to join.`, nodeId: node.id });
    }
    if (node.kind === 'router') {
      if (node.config.cases.length === 0) {
        issues.push({ message: `"${node.label}" has no cases.`, nodeId: node.id });
      }
      const seenCaseIds = new Set<string>();
      for (const routerCase of node.config.cases) {
        if (routerCase.id === WORKFLOW_ROUTER_DEFAULT_PORT_ID) {
          issues.push({
            message: `"${node.label}" case "${routerCase.label}" cannot use the reserved id "default".`,
            nodeId: node.id,
          });
        }
        if (seenCaseIds.has(routerCase.id)) {
          issues.push({
            message: `"${node.label}" has two cases with the id "${routerCase.id}".`,
            nodeId: node.id,
          });
        }
        seenCaseIds.add(routerCase.id);
        if (node.config.mode === 'expression' && !routerCase.when) {
          issues.push({
            message: `"${node.label}" case "${routerCase.label}" has no condition.`,
            nodeId: node.id,
          });
        }
      }
      if (node.config.mode === 'agent-label') {
        if (!node.config.agent || node.config.agent.agentId.trim() === '') {
          issues.push({ message: `"${node.label}" has no agent selected.`, nodeId: node.id });
        }
        if (!node.config.agent || node.config.agent.prompt.trim() === '') {
          issues.push({ message: `"${node.label}" has no prompt.`, nodeId: node.id });
        }
      }
    }
    if (node.kind === 'verify') {
      const check = node.config;
      if (check.check === 'agent' && check.agentId.trim() === '') {
        issues.push({ message: `"${node.label}" has no agent selected for its check.`, nodeId: node.id });
      }
      if ((check.check === 'exit-code' || check.check === 'test-counts') && check.command.trim() === '') {
        issues.push({ message: `"${node.label}" has no command.`, nodeId: node.id });
      }
      if (check.check === 'json-path' && check.op !== 'empty' && check.right === undefined) {
        issues.push({
          message: `"${node.label}" compares with "${check.op}" but has no right-hand value.`,
          nodeId: node.id,
        });
      }
      // The phase doc's own maker/checker rule: a verify node whose `agent`
      // check reuses the SAME agent id as the node feeding its `in` port is
      // suspicious, not invalid — a checker that is not the maker is the
      // whole point of a verifier (the Loop Engineering article's own
      // rule), but a workflow that has always run this way should not be
      // retroactively blocked from running. `severity: 'warning'` is what
      // keeps this off the engine's/canvas's blocking path.
      if (check.check === 'agent' && check.agentId.trim() !== '') {
        const inEdge = workflow.edges.find((edge) => edge.to === node.id && normalizeEdge(edge).toPort === 'in');
        const maker = inEdge ? workflow.nodes.find((n) => n.id === inEdge.from) : undefined;
        if (maker?.kind === 'agent' && maker.config.agentId.trim() === check.agentId.trim()) {
          issues.push({
            message: `"${node.label}" checks the same agent ("${check.agentId}") that produced the work it is checking — a checker that is not the maker catches more.`,
            nodeId: node.id,
            severity: 'warning',
          });
        }
      }
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

    // A port that no longer exists — a router case deleted, a node's kind
    // changed — leaves the edge dangling by name rather than by node. Only
    // checked once both ends resolve to a real, connectable node; the two
    // checks above already cover a missing node, and the note check above
    // already covers a note (which has no ports by design — flagging that
    // as a missing port would just repeat the same fact in a worse sentence).
    const fromNode = workflow.nodes.find((n) => n.id === edge.from);
    const toNode = workflow.nodes.find((n) => n.id === edge.to);
    if (fromNode && toNode && fromNode.kind !== 'note' && toNode.kind !== 'note') {
      const normalized = normalizeEdge(edge);
      // `workflow.edges` is passed here (Theme C) so a loop edge's own
      // `exhausted` out-port — which only exists BECAUSE this edge is a
      // loop edge — resolves rather than reading as a dangling port name.
      if (
        !portsForNode(fromNode, workflow.edges).some(
          (port) => port.direction === 'out' && port.id === normalized.fromPort,
        )
      ) {
        issues.push({
          message: `"${fromNode.label}" has no out-port named "${normalized.fromPort}".`,
          edgeId: edge.id,
        });
      }
      if (!portsForNode(toNode).some((port) => port.direction === 'in' && port.id === normalized.toPort)) {
        issues.push({
          message: `"${toNode.label}" has no in-port named "${normalized.toPort}".`,
          edgeId: edge.id,
        });
      }
    }

    // Controlled cycles (Theme C, Decision 3): a `loop` edge's bounds are
    // mandatory, and the edge must actually close a cycle — a `loop`-kind
    // edge that doesn't loop back anywhere is just a mistake, not a
    // controlled back-edge. A cycle made only of NON-loop edges is rejected
    // too, but at the engine's pre-run check (`findAcyclicEdgeViolation`),
    // the same place every other cycle is caught — this function stays
    // cycle-agnostic for everything else per its own doc comment above.
    if (normalizeEdge(edge).kind === 'loop') {
      if (!edge.loop) {
        issues.push({
          message: `"${edge.id}" is a loop edge with no maxIterations/budget set.`,
          edgeId: edge.id,
        });
      }
      if (fromNode && toNode) {
        const nonLoopSiblings = workflow.edges.filter(
          (e) => e.id !== edge.id && normalizeEdge(e).kind !== 'loop',
        );
        const nodeIds = workflow.nodes.map((n) => n.id);
        if (!wouldCycle(nonLoopSiblings, nodeIds, { from: edge.from, to: edge.to })) {
          issues.push({
            message: `"${edge.id}" is a loop edge that does not close a cycle back to an earlier node.`,
            edgeId: edge.id,
          });
        }
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
