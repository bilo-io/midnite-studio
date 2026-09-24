import {
  WORKFLOW_ERROR_PORT_ID,
  WORKFLOW_LOOP_EXHAUSTED_PORT_ID,
  hashLoopKey,
  loopBodyNodeIds,
  nodeRunIteration,
  normalizeEdge,
  portsForNode,
  readLoopKeyPath,
  redactPaths,
  workflowLoopStates,
  type NormalizedWorkflowEdge,
  type WorkflowEdge,
  type WorkflowLoopExitReason,
  type WorkflowLoopFailure,
  type WorkflowLoopState,
  type WorkflowNode,
  type WorkflowNodeRun,
  type WorkflowRun,
} from '@midnite/studio-shared';

/**
 * Phase 97 Theme C — the loop back-edge's own runtime logic, factored out of
 * `workflow-engine.ts` so it stays a pure, directly-testable module (no run
 * lock, no store, no clock injection ceremony).
 *
 * **Rebased onto Theme B (#558).** B introduced `WorkflowNodeRun.settledPort`
 * — the out-port every node kind settled on, generically, replacing the old
 * `condition`-only `gatedDownstream` special case — plus the per-edge
 * liveness primitives (`edgeState`, `edgesByTarget`, `settledPortFor`) that
 * read it. This module now rides that mechanism directly instead of
 * duplicating it: a loop redirect (`exhausted`, or a converged exit's
 * alternate port) is nothing more than an override of `node.settledPort`,
 * applied by `workflow-engine.ts` **after** B's own `settledPortFor` call —
 * B's existing cascade then does the actual routing. There is no second
 * cascade here, and no `takenPort` field; `evaluateLoopSettle` only ever
 * *reads* `nodeRun.settledPort` (B already wrote it) and, for the two
 * "stop" reasons that escalate, tells the caller what to overwrite it with.
 *
 * **A `loop`-kind edge itself never enters B's generic edge machinery.**
 * `workflow-engine.ts` filters `kind: 'loop'` edges out of every structural
 * traversal (the eligibility graph, the per-edge readiness cascade, the
 * ancestor walk) — a loop edge is not a routable edge at all, it is this
 * module's own scheduling primitive. Concretely this also sidesteps a real
 * deadlock: an unfiltered loop edge would make the loop's target look like
 * it depends on its own not-yet-run decision node on the very first pass.
 *
 * **Scope, deliberately narrow.** Every function here either only ever
 * touches a node that is a `loop` edge's source, or is a pure reader with an
 * identity fallback for a run that has never seen a loop edge at all — which
 * is what makes "an acyclic workflow runs identically to before" true by
 * construction.
 */

// --- iteration-aware node-run lookup ------------------------------------------

/**
 * `WorkflowRun.nodes` accumulates MULTIPLE records per node id once a loop
 * has run more than once (one per iteration, never overwritten — the phase
 * doc's own requirement). Everywhere the engine used to do
 * `run.nodes.find(n => n.nodeId === id)` now means "the current one", which
 * is this: the highest-`iteration` record for that id. For a run with no
 * loop (every node id appears exactly once, `iteration` unset/1), this is
 * the exact same object the old `.find` returned.
 *
 * Returns the actual array element (not a copy), so a caller mutating the
 * result mutates `run.nodes` in place — the same aliasing every other
 * function in `workflow-engine.ts` relies on under the run lock.
 */
export function activeNodeRun(run: WorkflowRun, nodeId: string): WorkflowNodeRun | undefined {
  let best: WorkflowNodeRun | undefined;
  for (const candidate of run.nodes) {
    if (candidate.nodeId !== nodeId) continue;
    if (!best || nodeRunIteration(candidate) >= nodeRunIteration(best)) best = candidate;
  }
  return best;
}

/** One entry per distinct node id — the current (highest-iteration) record for each, in first-seen order. */
export function activeNodeRuns(run: WorkflowRun): WorkflowNodeRun[] {
  const order: string[] = [];
  const best = new Map<string, WorkflowNodeRun>();
  for (const candidate of run.nodes) {
    if (!best.has(candidate.nodeId)) order.push(candidate.nodeId);
    const current = best.get(candidate.nodeId);
    if (!current || nodeRunIteration(candidate) >= nodeRunIteration(current)) best.set(candidate.nodeId, candidate);
  }
  return order.map((id) => best.get(id)!);
}

/** `edgesByTarget`/eligibility's own required precondition: a `loop` edge never enters ordinary structural traversal — see the module doc. */
export function nonLoopEdges(edges: readonly WorkflowEdge[]): WorkflowEdge[] {
  return edges.filter((edge) => normalizeEdge(edge).kind !== 'loop');
}

// --- the loop decision ---------------------------------------------------------

export type LoopSettleContext = {
  node: WorkflowNode;
  /**
   * This node's just-settled record, with `settledPort` ALREADY written by
   * B's `settledPortFor` — this module only ever reads it, never writes it;
   * the caller applies any override this function asks for.
   */
  nodeRun: WorkflowNodeRun;
  edges: readonly WorkflowEdge[];
  loopStates: readonly WorkflowLoopState[];
  now: number;
};

export type LoopSettleOutcome =
  /**
   * Either this node sources no `loop` edge at all, or it does but this
   * settle's `settledPort` doesn't match the loop edge's `fromPort` — B's
   * own per-edge cascade already routes everything correctly in both cases
   * (the loop edge itself is simply excluded from that cascade, so nothing
   * downstream of it is even eligible), so there is nothing to override.
   */
  | { action: 'none' }
  | {
      action: 'iterate';
      edge: NormalizedWorkflowEdge;
      bodyNodeIds: string[];
      nextIteration: number;
      loopState: WorkflowLoopState;
    }
  | {
      action: 'stop';
      edge: NormalizedWorkflowEdge;
      reason: WorkflowLoopExitReason;
      loopState: WorkflowLoopState;
      /**
       * What the caller must overwrite `node.settledPort` with instead of
       * whatever B's `settledPortFor` naturally computed (typically the
       * loop edge's own `fromPort`, since that is what made this settle a
       * candidate to iterate in the first place) — `'exhausted'` for every
       * reason but `'converged'`, which prefers a single unambiguous
       * alternate out-port and falls back to `'exhausted'` only when the
       * source has none.
       */
      settledPortOverride: string;
    };

/**
 * `'converged'` is the one exit reason that is NOT an escalation — a loop
 * that got what it needed does not belong on the same port as one that ran
 * out of room. When the source has exactly one other real out-port (besides
 * the loop edge and the error port), that is where a converged exit goes —
 * for a `condition`-shaped source this is `'true'`, i.e. "treat it as
 * though the loop's own condition had finally passed". A source with no
 * such single alternate (a plain node whose only port IS the loop edge) has
 * nowhere else to send a converged exit, so it falls back to `'exhausted'`
 * too, documented here rather than silently degrading.
 */
function convergedPort(node: WorkflowNode, edges: readonly WorkflowEdge[], loopEdge: NormalizedWorkflowEdge): string {
  const alternates = portsForNode(node, edges).filter(
    (port) =>
      port.direction === 'out' &&
      port.id !== loopEdge.fromPort &&
      port.id !== WORKFLOW_ERROR_PORT_ID &&
      port.id !== WORKFLOW_LOOP_EXHAUSTED_PORT_ID,
  );
  return alternates.length === 1 ? alternates[0]!.id : WORKFLOW_LOOP_EXHAUSTED_PORT_ID;
}

/**
 * The whole decision: given a just-settled loop-source node (its
 * `settledPort` already written by B's mechanism), either "nothing for the
 * loop to do" (`none`), "reset the body for another pass" (`iterate`), or
 * "stop, and override `settledPort` to redirect through this one" (`stop`).
 *
 * Priority among stop reasons is convergence, then budget, then
 * max-iterations — convergence is the most specific signal (a loop that
 * found nothing new to try), so it wins a tie against a bound that also
 * happens to be exceeded on the same iteration. `cancelled` is not decided
 * here at all: a mid-run cancel is the driver's own `state.cancelled` flag,
 * handled generically in `finalizeRun` — see `workflow-engine.ts`.
 *
 * Only ever looks at the FIRST `loop`-kind edge sourced at this node — the
 * phase doc's examples all wire exactly one back-edge per decision node, and
 * several loop edges racing off one node is a routing question for whatever
 * theme generalizes multi-edge port fan-out, not this one.
 */
export function evaluateLoopSettle(ctx: LoopSettleContext): LoopSettleOutcome {
  const loopEdge = ctx.edges
    .filter((edge) => edge.from === ctx.node.id && normalizeEdge(edge).kind === 'loop')
    .map((edge) => normalizeEdge(edge))[0];
  if (!loopEdge || !loopEdge.loop) return { action: 'none' };
  // B's `settledPortFor` already decided the node's natural port (a
  // condition's `'true'`/`'false'`, or `'out'` for anything else). If it
  // doesn't match the loop edge's own port, the loop simply was not on this
  // settle's path — e.g. the condition finally passed.
  if (ctx.nodeRun.settledPort !== loopEdge.fromPort) return { action: 'none' };

  const prior = ctx.loopStates.find((state) => state.edgeId === loopEdge.id);
  const state: WorkflowLoopState = prior ?? {
    edgeId: loopEdge.id,
    iteration: nodeRunIteration(ctx.nodeRun),
    startedAt: ctx.now,
    seenKeyHashes: [],
    dryStreak: 0,
  };

  // Dry-rounds bookkeeping runs unconditionally so `seenKeyHashes`/`dryStreak`
  // stay accurate even on an iteration a bound (budget/max-iterations)
  // pre-empts — Decision: "dedupe against everything seen", rejected keys
  // included.
  let seenKeyHashes = state.seenKeyHashes;
  let dryStreak = state.dryStreak;
  let convergedNow = false;
  const convergence = loopEdge.loop.convergence;
  if (convergence?.kind === 'dry-rounds') {
    const hash = hashLoopKey(readLoopKeyPath(ctx.nodeRun.output, convergence.keyPath));
    const repeated = seenKeyHashes.includes(hash);
    dryStreak = repeated ? dryStreak + 1 : 0;
    seenKeyHashes = repeated ? seenKeyHashes : [...seenKeyHashes, hash];
    convergedNow = dryStreak >= convergence.rounds;
  } else if (convergence?.kind === 'until-port') {
    const output = ctx.nodeRun.output as Record<string, unknown> | undefined;
    convergedNow = output !== undefined && output !== null && output[convergence.port] === true;
  }

  const bumped: WorkflowLoopState = { ...state, seenKeyHashes, dryStreak };
  const elapsedMs = ctx.now - state.startedAt;
  const nextIteration = state.iteration + 1;

  let reason: WorkflowLoopExitReason | null = null;
  if (convergedNow) reason = 'converged';
  else if (elapsedMs >= loopEdge.loop.budgetMs) reason = 'budget';
  else if (nextIteration > loopEdge.loop.maxIterations) reason = 'max-iterations';

  if (reason !== null) {
    return {
      action: 'stop',
      edge: loopEdge,
      reason,
      loopState: { ...bumped, exitReason: reason },
      settledPortOverride:
        reason === 'converged' ? convergedPort(ctx.node, ctx.edges, loopEdge) : WORKFLOW_LOOP_EXHAUSTED_PORT_ID,
    };
  }

  return {
    action: 'iterate',
    edge: loopEdge,
    bodyNodeIds: [...loopBodyNodeIds(loopEdge, ctx.edges)],
    nextIteration,
    loopState: { ...bumped, iteration: nextIteration },
  };
}

// --- applying an "iterate" decision --------------------------------------------

/**
 * Pushes fresh `pending` records (the given `iteration`) for every node in
 * the loop body — never overwriting the just-finished iteration's records,
 * per the phase doc. Mutates `run.nodes` in place (append), matching the
 * rest of `workflow-engine.ts`'s under-the-lock mutation style. `kind`/
 * `label` are copied from each node's current record, the same snapshot
 * discipline `startWorkflowRun` uses for the first iteration.
 */
export function pushIterationRecords(run: WorkflowRun, bodyNodeIds: readonly string[], iteration: number): void {
  for (const nodeId of bodyNodeIds) {
    const template = activeNodeRun(run, nodeId);
    if (!template) continue;
    run.nodes.push({
      nodeId,
      kind: template.kind,
      label: template.label,
      status: 'pending',
      truncated: false,
      gatedDownstream: false,
      iteration,
    });
  }
}

/** Upserts a loop's state into `run.loopStates`, preserving every other loop's entry untouched. */
export function upsertLoopState(run: WorkflowRun, state: WorkflowLoopState): void {
  const existing = workflowLoopStates(run);
  const next = existing.filter((s) => s.edgeId !== state.edgeId);
  next.push(state);
  run.loopStates = next;
}

// --- {{loop.*}} interpolation context -------------------------------------------

function stringifyForFailureMessage(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * `{{loop.iteration}}` / `{{loop.previous.<nodeId>...}}` / `{{loop.failures}}`
 * (the phase doc's "failure carried forward") — built ONLY for a node that
 * currently sits inside an active loop body, `null` for everything else
 * (which is every node in a non-looping workflow). Injected into
 * `runNode`'s `upstream` record under the reserved `'loop'` root
 * (`WORKFLOW_RESERVED_INTERPOLATION_ROOTS`, Theme M) in `workflow-engine.ts`;
 * ordinary `{{nodeId.path}}` ancestor resolution never changes.
 *
 * `failures` is capped at 20, oldest first, and every message is redacted
 * ({@link redactPaths}) before it can reach `interpolate.ts` or an agent's
 * prompt — the same discipline every other crash-adjacent text in this app
 * gets before it leaves the machine.
 */
export function buildLoopContext(
  run: WorkflowRun,
  nodeId: string,
  edges: readonly WorkflowEdge[],
): Record<string, unknown> | null {
  for (const state of workflowLoopStates(run)) {
    const loopEdgeRaw = edges.find((edge) => edge.id === state.edgeId);
    if (!loopEdgeRaw) continue;
    const loopEdge = normalizeEdge(loopEdgeRaw);
    const body = loopBodyNodeIds(loopEdge, edges);
    if (!body.has(nodeId)) continue;

    const previous: Record<string, unknown> = {};
    for (const id of body) {
      const record = run.nodes.find((n) => n.nodeId === id && nodeRunIteration(n) === state.iteration - 1);
      if (record && record.output !== undefined) previous[id] = record.output;
    }

    const failures: WorkflowLoopFailure[] = [];
    for (const record of run.nodes) {
      if (!body.has(record.nodeId)) continue;
      if (nodeRunIteration(record) >= state.iteration) continue;
      const isFailure = record.status === 'failed' || record.status === 'timeout' || record.loopExit !== undefined;
      if (!isFailure) continue;
      const rawMessage = record.error ?? (record.output !== undefined ? stringifyForFailureMessage(record.output) : 'no output');
      failures.push({ iteration: nodeRunIteration(record), nodeId: record.nodeId, message: redactPaths(rawMessage) });
    }

    return { iteration: state.iteration, previous, failures: failures.slice(-20) };
  }
  return null;
}
