import { randomUUID } from 'node:crypto';

import {
  WORKFLOW_ERROR_PORT_ID,
  WORKFLOW_NODE_CONCURRENCY,
  WORKFLOW_NODE_TIMEOUT_MS,
  failure,
  findAcyclicEdgeViolation,
  migrateWorkflowEdges,
  normalizeEdge,
  ok,
  portsForNode,
  validateWorkflow,
  workflowIssueSeverity,
  type GitOpResult,
  type Workflow,
  type WorkflowEdge,
  type WorkflowGateDecidedBy,
  type WorkflowGateDecision,
  type WorkflowJoinMode,
  type WorkflowNode,
  type WorkflowNodeRun,
  type WorkflowNodeStatus,
  type WorkflowRun,
} from '@midnite/studio-shared';

import { demoApiStatus } from '../demo-api/server';
import { defaultExecutors } from './executors';
import type { CancelSignal, ExecutorRegistry, NodeOutcome } from './executor-registry';
import { resolveGateWaiter } from './gate-waiters';
import {
  activeNodeRun,
  activeNodeRuns,
  buildLoopContext,
  evaluateLoopSettle,
  nonLoopEdges,
  pushIterationRecords,
  upsertLoopState,
} from './loop-controller';

/**
 * Runs one workflow: topological order over the graph, independent branches in
 * parallel, joining before any node with more than one input.
 *
 * Three things here are copied deliberately rather than reinvented, each
 * because Phase 34 already paid for the lesson.
 *
 * **The per-run mutation lock** is `council-runner.ts`'s `withRunLock`,
 * `prior.then(fn, fn)` and all — the queue has to advance on rejection too, or
 * one throwing mutation wedges every later one for that run. Parallel node
 * settles racing on a read-modify-write of the run object is the exact bug that
 * lock fixed, and a parallel node executor reproduces its conditions precisely.
 *
 * **Locked sections never nest.** `council-runner.ts:200` records that nesting
 * a second `withRunLock` inside one deadlocks against itself, and the shape of
 * this module follows from it: mutate state inside the lock, return a value out
 * of it, and start the next node *outside* it.
 *
 * **The run's node/edge snapshot is frozen before the first node launches.**
 * The whole `WorkflowRun` is built and persisted first, and execution reads
 * `run.nodes`/`run.edges` — never the live workflow — so editing the graph
 * mid-run cannot rewrite history or strand a node on an edge that just went
 * away.
 *
 * Runtime-only state (the cancel flag, the in-flight promise) lives in
 * {@link inFlight}, keyed by runId, and never on the persisted object — the
 * same rule `council-service.ts` applies to a member's `ptyId`.
 */

/** What the engine needs from the outside world. */
export type EngineDeps = {
  /** Persist a run. Called under the run's lock; must not itself lock. */
  saveRun: (run: WorkflowRun) => Promise<void>;
  /** Read a run back. The engine never caches it — the store is the truth. */
  getRun: (runId: string) => Promise<WorkflowRun | null>;
  /**
   * The run, as it stands right after the write that just triggered this
   * call — never a bare ping (Phase 95 Theme I; see `channels.ts` and
   * `schemas.ts`'s `WorkflowRunChangedEventSchema`). Every call site below
   * has just `saveRun`'d this exact object, so passing it costs nothing.
   */
  emitChanged: (run: WorkflowRun) => void;
  executors?: ExecutorRegistry;
  /**
   * The timer seam. Injected rather than reached for globally so the 120-second
   * deadline is testable in milliseconds without fake timers, which fight the
   * real promise scheduling around `fetch`/`await` and are a known flake source.
   */
  clock?: {
    now: () => number;
    setTimeout: (fn: () => void, ms: number) => { unref?: () => void };
    clearTimeout: (handle: never) => void;
  };
  /**
   * Overrides {@link WORKFLOW_NODE_TIMEOUT_MS} for a node with no timeout of
   * its own (Theme I's settings page). Injected, not read from a mutable
   * global, for the same testability reason as `clock`.
   */
  defaultTimeoutMs?: number;
};

type Timer = ReturnType<typeof setTimeout>;

const realClock = {
  now: () => Date.now(),
  setTimeout: (fn: () => void, ms: number) => {
    const timer = setTimeout(fn, ms);
    timer.unref?.();
    return timer;
  },
  clearTimeout: (handle: Timer) => clearTimeout(handle),
};

// --- per-run mutation lock ---------------------------------------------------

const runLocks = new Map<string, Promise<unknown>>();

function withRunLock<T>(runId: string, fn: () => Promise<T>): Promise<T> {
  const prior = runLocks.get(runId) ?? Promise.resolve();
  const settled = prior.then(fn, fn);
  const tail: Promise<void> = settled.then(
    () => undefined,
    () => undefined,
  );
  runLocks.set(runId, tail);
  // `write-queue.ts`'s `evictIfCurrent` idiom: delete only if the map still
  // holds *this* tail, so a lock re-taken while the old one settles is not
  // dropped out from under the newer chain. Without the eviction the map leaks
  // one entry per run for the life of the process.
  void tail.then(() => {
    if (runLocks.get(runId) === tail) runLocks.delete(runId);
  });
  return settled;
}

/** Test-only: `runLocks` is otherwise module-private. */
export function runLocksSizeForTests(): number {
  return runLocks.size;
}

// --- in-flight runs ----------------------------------------------------------

type InFlight = { cancelled: boolean; done: Promise<void> };

const inFlight = new Map<string, InFlight>();

export function isRunning(runId: string): boolean {
  return inFlight.has(runId);
}

// --- graph -------------------------------------------------------------------

type Graph = {
  /** Node id → the ids that must finish before it may start. */
  parents: Map<string, string[]>;
  /** Node id → the ids that wait on it. */
  children: Map<string, string[]>;
};

/**
 * `edges` must already have `kind: 'loop'` edges filtered out (`nonLoopEdges`,
 * `loop-controller.ts`) — every call site below does that before calling in.
 * A loop edge never enters the ordinary graph: its target already ran in an
 * earlier iteration and is `succeeded`/terminal, not `pending`, so it would
 * never become "eligible" again through this structural graph anyway —
 * iteration is driven entirely by `pushIterationRecords` pushing fresh
 * `pending` records. Building `parents`/`children` from the RAW edge list
 * (loop edges included) would instead deadlock the very first iteration: the
 * loop's target would appear to depend on its own not-yet-run decision node.
 */
function buildGraph(nodeIds: readonly string[], edges: readonly WorkflowEdge[]): Graph {
  const parents = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  const children = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  for (const edge of edges) {
    parents.get(edge.to)?.push(edge.from);
    children.get(edge.from)?.push(edge.to);
  }
  return { parents, children };
}

/**
 * Every edge keyed by its target node id — the shape the readiness pass below
 * walks. Same `nonLoopEdges` precondition as {@link buildGraph} — a `loop`
 * edge is this app's one non-routable edge kind, a scheduling primitive
 * `loop-controller.ts` owns rather than an ordinary taken/dead edge.
 */
function edgesByTarget(edges: readonly WorkflowEdge[]): Map<string, WorkflowEdge[]> {
  const map = new Map<string, WorkflowEdge[]>();
  for (const edge of edges) {
    if (!map.has(edge.to)) map.set(edge.to, []);
    map.get(edge.to)!.push(edge);
  }
  return map;
}

// --- per-edge readiness (Phase 97 Theme B) ------------------------------------

/**
 * Whether an edge was actually followed, resolved **per edge, not per
 * parent** — the doc's own framing. `sourceSettledPort` is
 * {@link WorkflowNodeRun.settledPort}, written once at settle time (below) so
 * this function never has to re-derive it.
 *
 * `sourceSettledPort === undefined` on a terminal, non-skipped source is the
 * **legacy-cascade** case: a failed/timed-out node with no wired error edge
 * settles on nothing routable, so every one of its outgoing edges is dead —
 * exactly today's "a failure skips every dependant" behaviour, just reached
 * through the port mechanism instead of a status-category check.
 */
type EdgeState = 'taken' | 'dead' | 'pending';

function edgeState(
  edge: WorkflowEdge,
  sourceStatus: WorkflowNodeStatus | undefined,
  sourceSettledPort: string | undefined,
): EdgeState {
  if (sourceStatus === undefined || sourceStatus === 'pending' || sourceStatus === 'running') {
    return 'pending';
  }
  if (sourceStatus === 'skipped') return 'dead'; // never settled on any port — cascades as dead.
  if (sourceSettledPort === undefined) return 'dead'; // legacy cascade, see doc comment above.
  return normalizeEdge(edge).fromPort === sourceSettledPort ? 'taken' : 'dead';
}

/**
 * What a settled node's own `settledPort` should be — the one place this is
 * computed, shared by the async-executor path ({@link settleNode}) and the
 * join's inline settlement so the two can never disagree about what "this
 * node has an error edge" means.
 */
function settledPortFor(
  status: WorkflowNodeStatus,
  outcomePort: string | undefined,
  nodeId: string,
  edges: readonly WorkflowEdge[],
): string | undefined {
  if (status === 'succeeded') return outcomePort ?? 'out';
  if (status === 'failed' || status === 'timeout') {
    const hasErrorEdge = edges.some(
      (edge) => edge.from === nodeId && normalizeEdge(edge).fromPort === WORKFLOW_ERROR_PORT_ID,
    );
    return hasErrorEdge ? WORKFLOW_ERROR_PORT_ID : undefined;
  }
  return undefined; // pending / running / skipped.
}

/** The shared `{message, status}` shape every error port carries — see `errorPort()` in `shared/src/workflow.ts`. */
function errorOutcomePayload(message: string, timedOut: boolean): { message: string; status: number } {
  return { message, status: timedOut ? 408 : 500 };
}

/**
 * Why a skipped node's dependant reads the way it does — kept close to
 * {@link edgeState} so the two stay in sync. `conditional`/`loop` edges name
 * the port that was not taken; a plain `data`/`error` edge behind a failure
 * keeps the MVP's original wording.
 */
function deadEdgeMessage(edge: WorkflowEdge, sourceStatus: WorkflowNodeStatus | undefined): string {
  const normalized = normalizeEdge(edge);
  if (normalized.kind === 'conditional' || normalized.kind === 'loop') {
    return `Skipped — "${normalized.fromPort}" was not taken.`;
  }
  if (sourceStatus === 'skipped') return 'Skipped — an earlier step did not run.';
  return 'Skipped — an earlier step did not succeed.';
}

// --- join settlement (Phase 97 Theme B) ---------------------------------------

type JoinPortState = { portId: string; edge: WorkflowEdge; state: EdgeState };

/**
 * A join's own wired ports, each matched to the (at most one) edge landing on
 * it — an unwired `in-N` is simply absent here, not counted against any mode.
 */
function joinPortStates(
  joinNode: WorkflowNode,
  inEdges: readonly WorkflowEdge[],
  statusOf: (id: string) => WorkflowNodeStatus | undefined,
  portOf: (id: string) => string | undefined,
): JoinPortState[] {
  const ports = portsForNode(joinNode).filter((port) => port.direction === 'in');
  const states: JoinPortState[] = [];
  for (const port of ports) {
    const edge = inEdges.find((candidate) => normalizeEdge(candidate).toPort === port.id);
    if (!edge) continue;
    states.push({ portId: port.id, edge, state: edgeState(edge, statusOf(edge.from), portOf(edge.from)) });
  }
  return states;
}

type JoinOutcome = 'wait' | { settle: 'succeeded' | 'failed'; reason: string };

/**
 * The three modes from the phase doc. `all` keeps the same AND semantics
 * plain nodes have, just surfaced as the join's own `failed` status rather
 * than a silent skip — the doc's "fails if any input failed". `any` fires the
 * instant one input is taken and never waits on, or cancels, the rest. Every
 * mode with zero wired ports fails immediately: a join with nothing to join
 * is a misconfigured graph, not a vacuous success.
 */
function joinOutcome(mode: WorkflowJoinMode, states: readonly JoinPortState[]): JoinOutcome {
  if (states.length === 0) return { settle: 'failed', reason: 'This join has nothing wired to it.' };
  const pending = states.filter((s) => s.state === 'pending');
  const taken = states.filter((s) => s.state === 'taken');
  const dead = states.filter((s) => s.state === 'dead');

  if (mode === 'any') {
    if (taken.length > 0) return { settle: 'succeeded', reason: '' };
    if (pending.length > 0) return 'wait';
    return { settle: 'failed', reason: 'Every input to this join was skipped or failed.' };
  }
  if (mode === 'allSettled') {
    if (pending.length > 0) return 'wait';
    return { settle: 'succeeded', reason: '' };
  }
  // 'all'
  if (dead.length > 0) {
    return { settle: 'failed', reason: `"${dead[0]!.portId}" was not taken.` };
  }
  if (pending.length > 0) return 'wait';
  return { settle: 'succeeded', reason: '' };
}

/**
 * Build the join's own output once its mode has decided to settle —
 * `results` (`all`), the single winning input (`any`), or the
 * `{fulfilled, rejected}` split (`allSettled`, Promise.allSettled's own
 * shape — `{{join.fulfilled.0.body}}` in the phase doc's own worked example).
 * `nodeOutput` reads a settled ancestor's recorded output straight off the run.
 */
function buildJoinOutput(
  mode: WorkflowJoinMode,
  states: readonly JoinPortState[],
  nodeOutput: (nodeId: string) => unknown,
): unknown {
  const taken = states.filter((s) => s.state === 'taken');
  if (mode === 'any') {
    const winner = taken[0];
    return winner ? { result: nodeOutput(winner.edge.from), from: winner.edge.from } : null;
  }
  if (mode === 'allSettled') {
    return {
      fulfilled: taken.map((s) => nodeOutput(s.edge.from)),
      rejected: states
        .filter((s) => s.state === 'dead')
        .map((s) => ({ nodeId: s.edge.from, portId: s.portId })),
    };
  }
  return { results: taken.map((s) => nodeOutput(s.edge.from)) };
}

// `findCycleEdge` itself now lives in `shared/src/workflow.ts` — the canvas
// needs the identical check and `app` may not import `desktop`, so this is
// the one piece of the engine hoisted there rather than duplicated. A hang is
// not an acceptable way to discover a cycle, so it still runs before the
// first node launches, below.

// --- run lifecycle -----------------------------------------------------------

const TERMINAL: ReadonlySet<WorkflowNodeStatus> = new Set([
  'succeeded',
  'failed',
  'timeout',
  'skipped',
]);

function statusFor(run: WorkflowRun): WorkflowRun['status'] {
  // `activeNodeRuns`, not raw `run.nodes`: a loop body node whose FIRST
  // iteration failed but whose latest iteration succeeded must not fail the
  // whole run over history a later pass already superseded.
  if (activeNodeRuns(run).some((node) => node.status === 'failed' || node.status === 'timeout')) return 'failed';
  return 'completed';
}

/**
 * Start a run.
 *
 * Resolves as soon as the run exists and its first nodes are launched — a run
 * can take minutes, and its progress arrives on `workflowRunChanged`. The
 * runId is minted here in **main** with `randomUUID()`, following
 * `tests-handlers.ts` and `loop-runs.ts`: it is not a renderer-owned
 * `requestId`, which is a convention for streams the renderer can supersede,
 * and a run is not one.
 */
export async function startWorkflowRun(
  workflowIn: Workflow,
  deps: EngineDeps,
): Promise<GitOpResult<WorkflowRun>> {
  // A workflow reaching the engine directly (a test fixture, or any future
  // caller that bypasses `workflows-store.ts`'s own load-time migration)
  // still gets a legacy `condition` node's edges mapped onto its `true` port
  // — otherwise `validateWorkflow`'s port-existence check (Theme A) would
  // reject an old workflow that has always run fine.
  const workflow = migrateWorkflowEdges(workflowIn);

  // Theme E's maker == checker rule (and any future warning) must not block
  // Run — only an error-severity issue does. `workflowIssueSeverity` reads a
  // pre-Theme-E issue (no `severity` field at all) as `'error'`, so this
  // filter changes nothing for a workflow that has never had a warning.
  const issues = validateWorkflow(workflow).filter((issue) => workflowIssueSeverity(issue) === 'error');
  if (issues.length > 0) {
    const first = issues[0]!;
    return failure(`This workflow cannot run yet: ${first.message}`);
  }

  const runnable = workflow.nodes.filter((node) => node.kind !== 'note');
  // `findAcyclicEdgeViolation`, not `findCycleEdge` directly (Theme C): a
  // `loop`-kind edge is the one deliberate exception to acyclicity.
  const cycle = findAcyclicEdgeViolation(
    runnable.map((node) => node.id),
    workflow.edges,
  );
  if (cycle) {
    return failure(
      `This workflow has a cycle — the connection "${cycle.id}" closes a loop. Remove it and run again.`,
    );
  }

  const now = (deps.clock ?? realClock).now();
  const run: WorkflowRun = {
    id: randomUUID(),
    workflowId: workflow.id,
    workflowName: workflow.name,
    status: 'running',
    nodes: runnable.map(
      (node): WorkflowNodeRun => ({
        nodeId: node.id,
        kind: node.kind,
        label: node.label,
        status: 'pending',
        truncated: false,
        gatedDownstream: false,
      }),
    ),
    edges: workflow.edges.map((edge) => ({ ...edge })),
    startedAt: now,
  };
  // Persisted before anything launches: this is the frozen snapshot, and a
  // settle that landed before the run existed would have nowhere to write.
  await deps.saveRun(run);
  deps.emitChanged(run);

  const state: InFlight = { cancelled: false, done: Promise.resolve() };
  inFlight.set(run.id, state);
  state.done = drive(run.id, workflow.id, runnable, deps, state).finally(() => inFlight.delete(run.id));
  // Not awaited: the invoke answers with the run, not with its outcome. The
  // rejection guard is here because `drive` throwing would otherwise be an
  // unhandled rejection taking main down.
  void state.done.catch(() => undefined);

  return ok(run);
}

/**
 * Cancel a run: no un-started node launches, and every node that has not
 * settled reaches a terminal state rather than sitting `pending` forever.
 */
export async function cancelWorkflowRun(runId: string, deps: EngineDeps): Promise<GitOpResult> {
  const state = inFlight.get(runId);
  if (!state) {
    const existing = await deps.getRun(runId);
    if (!existing) return failure('That run no longer exists.');
    return failure('That run has already finished.');
  }
  state.cancelled = true;
  /*
    Wait for the driver to stop and write the terminal state, so the caller's
    next read cannot see a half-cancelled run — but SWALLOW its rejection.
    `drive` can reject (its `finally` awaits `finalizeRun`, whose locked body
    reads the store), and letting that out of here would throw across
    `ipcRenderer.invoke`, which this repo's IPC ops never do: the renderer would
    get an opaque "Error invoking remote method …" with the real cause gone. The
    cancel itself succeeded regardless — the flag is set and honoured.
  */
  await state.done.catch(() => undefined);
  return ok();
}

// --- the driver --------------------------------------------------------------

/**
 * Walks the graph until nothing is left to start.
 *
 * The whole loop reads run state through the lock and starts nodes outside it,
 * because nesting a lock inside a lock deadlocks (see the module doc). The
 * `while` is driven by "did anything change?" rather than by a fixed order: a
 * node settling is what makes its children eligible, and the settle happens on
 * another turn of the event loop.
 */
async function drive(
  runId: string,
  workflowId: string,
  nodes: readonly WorkflowNode[],
  deps: EngineDeps,
  state: InFlight,
): Promise<void> {
  const executors = deps.executors ?? defaultExecutors;
  const clock = deps.clock ?? realClock;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const running = new Map<string, Promise<void>>();

  /*
    The loop is wrapped so the terminal write in the `finally` cannot be
    skipped. A store write that throws mid-run would otherwise leave the run
    `running` for ever with nobody left to advance it — and the next launch
    would "finalise" it as interrupted, which is a lie about what happened.
  */
  let driveError: string | null = null;
  try {
    for (;;) {
      if (state.cancelled) break;

      const ready = await withRunLock(runId, async () => {
        const run = await deps.getRun(runId);
        if (!run) return [];
        const structuralEdges = nonLoopEdges(run.edges);
        const graph = buildGraph(
          run.nodes.map((n) => n.nodeId),
          structuralEdges,
        );
        const incoming = edgesByTarget(structuralEdges);
        const status = new Map(run.nodes.map((n) => [n.nodeId, n.status]));
        const settledPort = new Map(run.nodes.map((n) => [n.nodeId, n.settledPort]));
        const nodeById = new Map(run.nodes.map((n) => [n.nodeId, n]));

        /*
          The cascade runs to a FIXED POINT, not once over the array.

          One pass in array order is wrong, and wrong in a way a user hits on
          their first run: `run.nodes` is drop order on the canvas, so a graph
          wired a→b→c whose nodes were dropped c, b, a marks `b` skipped, writes
          that into `status` — where `skipped` counts as terminal — and then
          finds `c` eligible and RUNS it under a failed grandparent. If `c` is
          an `http` node, that is a real request that should never have been
          sent. Looping until nothing changes propagates the skip the whole
          length of the chain whatever order the nodes sit in.

          It must also settle before eligibility is computed at all, or a node
          under a failed parent counts as "still waiting" for ever and the
          driver finds nothing to start and nothing to wait on.

          Two things settle directly in this loop rather than through the
          async executor path below: a **skip** (as before) and, new in Theme
          B, a **join** — pure aggregation over already-terminal ancestor
          outputs, so it has nothing to await and settles the moment its mode
          decides.
        */
        let mutated = false;
        for (;;) {
          let changedThisPass = false;
          for (const node of run.nodes) {
            if (node.status !== 'pending') continue;
            const def = byId.get(node.nodeId);
            const inEdges = incoming.get(node.nodeId) ?? [];

            if (def?.kind === 'join') {
              const states = joinPortStates(
                def,
                inEdges,
                (id) => status.get(id),
                (id) => settledPort.get(id),
              );
              const outcome = joinOutcome(def.config.mode, states);
              if (outcome === 'wait') continue;
              node.status = outcome.settle;
              node.startedAt = node.startedAt ?? clock.now();
              node.endedAt = clock.now();
              if (outcome.settle === 'succeeded') {
                node.output = buildJoinOutput(def.config.mode, states, (id) => nodeById.get(id)?.output);
              } else {
                node.error = outcome.reason;
              }
              node.settledPort = settledPortFor(node.status, 'out', node.nodeId, run.edges);
              if (node.settledPort === WORKFLOW_ERROR_PORT_ID) {
                node.output = errorOutcomePayload(outcome.reason, false);
              }
              status.set(node.nodeId, node.status);
              settledPort.set(node.nodeId, node.settledPort);
              changedThisPass = true;
              mutated = true;
              continue;
            }

            if (inEdges.length === 0) continue; // a root node — nothing to gate on.
            const states = inEdges.map((edge) => edgeState(edge, status.get(edge.from), settledPort.get(edge.from)));
            if (states.some((s) => s === 'pending')) continue;
            const deadIndex = states.findIndex((s) => s === 'dead');
            if (deadIndex === -1) continue; // every in-edge taken — eligible below.

            const deadEdge = inEdges[deadIndex]!;
            node.status = 'skipped';
            node.error = deadEdgeMessage(deadEdge, status.get(deadEdge.from));
            node.endedAt = clock.now();
            status.set(node.nodeId, 'skipped');
            changedThisPass = true;
            mutated = true;
          }
          if (!changedThisPass) break;
        }

        const inFlightCount = run.nodes.filter((n) => n.status === 'running').length;
        const room = Math.max(0, WORKFLOW_NODE_CONCURRENCY - inFlightCount);
        const eligible = run.nodes
          .filter(
            (node) =>
              node.status === 'pending' &&
              // A join never reaches the async executor path — it always
              // settles above, inline, the moment its mode decides. Excluded
              // here defensively: if it is still `pending` at this point some
              // real wired parent is genuinely non-terminal, so this check
              // would already exclude it, but nothing should ever depend on
              // that holding by coincidence.
              byId.get(node.nodeId)?.kind !== 'join' &&
              (graph.parents.get(node.nodeId) ?? []).every((parent) =>
                TERMINAL.has(status.get(parent) ?? 'pending'),
              ),
          )
          .slice(0, room);

        // Claimed inside the lock, so two turns of this loop cannot both start
        // the same node.
        const claimed: string[] = [];
        for (const node of eligible) {
          node.status = 'running';
          node.startedAt = clock.now();
          claimed.push(node.nodeId);
        }
        if (claimed.length > 0 || mutated) {
          await deps.saveRun(run);
          deps.emitChanged(run);
        }
        return claimed;
      });

      for (const nodeId of ready) {
        const node = byId.get(nodeId);
        /*
          A claimed id with no node behind it cannot happen — both lists are
          built from the same `runnable` array — but the consequence if it ever
          did is an unbounded spin: the node stays `running`, nothing
          downstream becomes eligible, and there is no settle to wait on.
          Settling it as a failure keeps the run terminating.
        */
        if (!node) {
          await settleNode(
            runId,
            nodeId,
            { status: 'failed', result: { ok: false, error: 'This step is no longer part of the workflow.' } },
            deps,
          );
          continue;
        }
        // Started OUTSIDE the lock — see the module doc.
        const promise = executeNode(runId, workflowId, node, deps, state, executors).finally(() =>
          running.delete(nodeId),
        );
        running.set(nodeId, promise);
      }

      if (running.size === 0) {
        if (ready.length === 0) break; // Nothing running, nothing startable: done.
        continue;
      }
      // One settle is all it takes to make more nodes eligible; the rest of the
      // fan-out keeps running while this turn re-evaluates.
      await Promise.race(running.values());
    }
  } catch (error) {
    driveError = error instanceof Error ? error.message : String(error);
  } finally {
    // A cancel leaves in-flight nodes to notice their own signal; wait for them
    // so the terminal write below is the last one.
    await Promise.allSettled(running.values());
    await finalizeRun(runId, deps, state, driveError);
  }
}

/**
 * The one write that closes a run out.
 *
 * Reached from `drive`'s `finally`, so no path — an exhausted graph, a cancel,
 * a store write that threw — can leave a run stuck `running`.
 */
async function finalizeRun(
  runId: string,
  deps: EngineDeps,
  state: InFlight,
  driveError: string | null,
): Promise<void> {
  const clock = deps.clock ?? realClock;
  const run = await withRunLock(runId, async () => {
    const run = await deps.getRun(runId);
    if (!run) return null;
    if (state.cancelled) {
      for (const node of run.nodes) {
        if (TERMINAL.has(node.status)) continue;
        node.status = 'skipped';
        node.error = node.error ?? 'Cancelled.';
        node.endedAt = clock.now();
      }
      // Theme C: any loop still in progress (no `exitReason` yet) is
      // stamped `cancelled` too, for the run's own telemetry — the loop
      // body's `pending` records are already swept to `skipped` by the loop
      // just above; this is purely the record of why.
      run.loopStates = (run.loopStates ?? []).map((s) => (s.exitReason ? s : { ...s, exitReason: 'cancelled' }));
      run.status = 'cancelled';
    } else if (driveError !== null) {
      // The engine itself broke, so no node's own state is trustworthy: every
      // one still open is failed with the cause, and the run says why.
      for (const node of run.nodes) {
        if (TERMINAL.has(node.status)) continue;
        node.status = 'failed';
        node.error = node.error ?? driveError;
        node.endedAt = clock.now();
      }
      run.status = 'failed';
      run.error = driveError;
    } else {
      run.status = statusFor(run);
    }
    run.endedAt = clock.now();
    await deps.saveRun(run);
    return run;
  });
  // `run` is `null` only when the run vanished from the store between
  // `drive`'s loop exiting and this write — nothing left to announce.
  if (run) deps.emitChanged(run);
}

/**
 * Effectively "never" for the generic per-node deadline race below — a
 * `gate` manages its own timeout entirely inside its executor
 * (`executors/gate.ts`'s own `config.timeoutMs`, or waiting forever), and the
 * generic race MUST NOT win first: it produces the `timeout` `WorkflowNodeStatus`,
 * which `statusFor` treats as a run failure — wrong for a gate's own timeout,
 * which settles `rejected` (an ordinary branch, exactly like a `false`
 * `condition`), never a failure. Capped just under `setTimeout`'s signed
 * 32-bit ms ceiling (`2^31 - 1`) rather than `Infinity`, which Node clamps to
 * firing on the very next tick instead of "never".
 */
const WORKFLOW_GATE_ENGINE_BACKSTOP_MS = 2_147_483_000;

function timeoutFor(node: WorkflowNode, deps: EngineDeps): number {
  if (node.kind === 'gate') return WORKFLOW_GATE_ENGINE_BACKSTOP_MS;
  if (node.kind === 'http' && node.config.timeoutMs !== undefined) return node.config.timeoutMs;
  return deps.defaultTimeoutMs ?? WORKFLOW_NODE_TIMEOUT_MS;
}

/**
 * Run one node, race its outcome against the per-node deadline, and record
 * whichever won — exactly once.
 *
 * `trackOneShot`'s idiom (`council-runner.ts:289`): one `settled` boolean, both
 * paths calling the same settle, and the timer unref'd so a pending deadline
 * never holds the event loop open at quit.
 */
async function executeNode(
  runId: string,
  workflowId: string,
  node: WorkflowNode,
  deps: EngineDeps,
  state: InFlight,
  executors: ExecutorRegistry,
): Promise<void> {
  const outcome = await runNode(runId, workflowId, node, deps, state, executors, timeoutFor(node, deps));
  await settleNode(runId, node.id, outcome, deps, node);
}

/**
 * Resolve the node's upstream outputs, then run it with a deadline.
 *
 * Upstream resolution is a read of the run under its lock — a node's inputs are
 * every ancestor's recorded output, keyed by node id, which is what
 * `{{nodeId.path}}` resolves against. Read once, immediately before the call,
 * so a node that started late still sees what finished while it waited.
 */
async function runNode(
  runId: string,
  workflowId: string,
  node: WorkflowNode,
  deps: EngineDeps,
  state: InFlight,
  executors: ExecutorRegistry,
  timeoutMs: number,
): Promise<{ status: WorkflowNodeStatus; result?: NodeOutcome }> {
  const clock = deps.clock ?? realClock;
  /*
    Only this node's ANCESTORS reached through a TAKEN edge (Phase 97 Theme
    B), not every structural ancestor and not every node that happens to have
    settled.

    Handing over every settled output made a reference across two unconnected
    branches resolve or fail depending purely on scheduling — `{{b.body.id}}`
    from a node in a different branch worked if `b` won the race and failed if
    it did not, which with a concurrency of 4 flips run to run. Restricting it
    to real ancestors made both outcomes deterministic; restricting it further
    to *taken* ancestors is the same fix applied to routing — a node behind a
    condition's dead branch, or reached only through an error port that never
    fired, is not meaningfully "upstream" either, and `{{...}}` referencing it
    should fail the same honest way an unconnected reference does.

    Read immediately before the call, under the lock, so a node that waited on
    a join sees everything that landed while it waited.
  */
  const upstream = await withRunLock(runId, async () => {
    const run = await deps.getRun(runId);
    if (!run) return {};
    // Loop edges excluded (Theme C) for the identical reason the eligibility
    // pass excludes them — see `buildGraph`'s doc comment: otherwise a loop
    // body's own ancestor walk would fold back through its not-yet-settled
    // decision node, or through the node's own earlier iteration.
    const incoming = edgesByTarget(nonLoopEdges(run.edges));
    const status = new Map(run.nodes.map((n) => [n.nodeId, n.status]));
    const settledPort = new Map(run.nodes.map((n) => [n.nodeId, n.settledPort]));

    const takenParentsOf = (id: string): string[] =>
      (incoming.get(id) ?? [])
        .filter((edge) => edgeState(edge, status.get(edge.from), settledPort.get(edge.from)) === 'taken')
        .map((edge) => edge.from);

    const ancestors = new Set<string>();
    const queue = takenParentsOf(node.id);
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (ancestors.has(id)) continue;
      ancestors.add(id);
      queue.push(...takenParentsOf(id));
    }

    const outputs: Record<string, unknown> = {};
    for (const ancestorId of ancestors) {
      // `activeNodeRun` (Theme C), not a raw scan of `run.nodes`: once a loop
      // has iterated, an ancestor id may have several historical records —
      // this is the current one.
      const record = activeNodeRun(run, ancestorId);
      if (record && record.output !== undefined) outputs[ancestorId] = record.output;
    }
    // `{{loop.iteration}}` / `{{loop.previous.<nodeId>...}}` / `{{loop.failures}}`
    // (Theme C) — `null` for any node outside an active loop body, which is
    // every node in a workflow with no loop edge.
    const loopContext = buildLoopContext(run, node.id, run.edges);
    if (loopContext) outputs.loop = loopContext;
    return outputs;
  });

  /*
    Theme M's reserved `{{demo.baseUrl}}` root (Phase 97 — see
    `WORKFLOW_RESERVED_INTERPOLATION_ROOTS` in shared/src/workflow.ts, which
    `validateWorkflow` uses to keep `demo` from ever being a real node id).
    Set only while the demo API is actually running — left unset otherwise, so
    a reference resolves to nothing and the `http` executor's own check turns
    that into "Demo API is not running…" rather than the generic "not
    upstream" message a made-up node id would get.
  */
  const demoStatus = demoApiStatus();
  if (demoStatus.running) {
    upstream.demo = { baseUrl: `http://127.0.0.1:${demoStatus.port}` };
  }

  const signal: CancelSignal = { cancelled: () => state.cancelled };
  const reportSessionId = (sessionId: string) => patchNodeSessionId(runId, node.id, sessionId, deps);
  const reportWaiting = () => patchNodeWaiting(runId, node.id, deps);
  let settled = false;

  return new Promise((resolve) => {
    const timer = clock.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ status: 'timeout' });
    }, timeoutMs);

    void executors[node.kind](node, {
      upstream,
      signal,
      timeoutMs,
      workflowId,
      runId,
      reportSessionId,
      reportWaiting,
    }).then(
      (result) => {
        if (settled) return;
        settled = true;
        clock.clearTimeout(timer as never);
        // An executor that honoured the deadline itself says so, and the node
        // records `timeout` — it is the only party that could actually abort
        // the work, so it is the only one that knows.
        const failed = result.ok === false && result.timedOut === true ? 'timeout' : 'failed';
        resolve({ status: result.ok ? 'succeeded' : failed, result });
      },
      (error: unknown) => {
        // An executor that rejects is a BUG in the executor, not a node
        // failure — but taking main down over it would be worse than
        // recording it, so it lands as a failure with the cause visible.
        if (settled) return;
        settled = true;
        clock.clearTimeout(timer as never);
        const message = error instanceof Error ? error.message : String(error);
        resolve({ status: 'failed', result: { ok: false, error: `Executor error: ${message}` } });
      },
    );
  });
}

async function settleNode(
  runId: string,
  nodeId: string,
  outcome: { status: WorkflowNodeStatus; result?: NodeOutcome },
  deps: EngineDeps,
  workflowNode?: WorkflowNode,
): Promise<void> {
  const clock = deps.clock ?? realClock;
  const run = await withRunLock(runId, async () => {
    const run = await deps.getRun(runId);
    if (!run) return null;
    // `activeNodeRun` (Theme C), not a bare `.find`: once a loop has run more
    // than once, several records share this `nodeId` (one per iteration) and
    // the one that is actually `running` is always the latest — `.find`
    // would return the FIRST (oldest, already-terminal) one and silently
    // no-op every settle after a node's first iteration.
    const node = activeNodeRun(run, nodeId);
    if (!node) return null;
    // The idempotence guard, INSIDE the lock: a cancel can race a real settle,
    // and whichever landed first is the one that counts. `'waiting'` joins
    // `'running'` here (Phase 97 Theme D): by the time a `gate`'s own
    // executor promise resolves, `reportWaiting` has already moved this
    // node's status to `'waiting'` — a guard that only accepted `'running'`
    // would silently no-op every gate decide.
    if (node.status !== 'running' && node.status !== 'waiting') return null;

    node.status = outcome.status;
    node.endedAt = clock.now();
    const result = outcome.result;
    if (outcome.status === 'timeout') {
      // The executor's own message names the budget it blew; the engine's
      // backstop deadline has no message of its own to offer.
      node.error = result?.ok === false ? result.error : 'Timed out.';
    } else if (result?.ok === true) {
      node.output = result.output;
      node.truncated = result.truncated === true;
    } else if (result?.ok === false) {
      node.error = result.error;
    }

    /*
      Which out-port this settle actually routes through (Phase 97 Theme B) —
      `'true'`/`'false'` for a condition, `'out'` for a plain success, `'error'`
      only when a wired error edge exists. This is what the driver's per-edge
      readiness pass reads to decide, for every downstream edge, whether it
      was taken or dead — the same mechanism now covers what `gatedDownstream`
      used to special-case for `condition` alone. That field stays on the
      schema for reading pre-Theme-B run history; nothing here writes it again.
    */
    node.settledPort = settledPortFor(
      node.status,
      result?.ok === true ? result.port : undefined,
      node.nodeId,
      run.edges,
    );
    // Routed onto the error port: give the downstream node something to
    // `{{...}}`-reference, matching `errorPort()`'s declared `{message,
    // status}` shape in `shared/src/workflow.ts` — the same payload a failed
    // join builds for itself just above.
    if (node.settledPort === WORKFLOW_ERROR_PORT_ID) {
      node.output = errorOutcomePayload(node.error ?? 'Unknown error', node.status === 'timeout');
    }

    // Phase 97 Theme C: only ever does anything when `workflowNode` is a
    // `loop` edge's source AND this settle's `settledPort` matches that
    // edge's own port — see `loop-controller.ts`'s doc comment for the full
    // decision. Deliberately AFTER B's `settledPort`/error-payload logic
    // above, since a `stop` here OVERRIDES `settledPort` rather than
    // computing it from scratch — there is no second cascade, only a
    // redirect B's own per-edge readiness pass then routes through as usual.
    if (workflowNode && (node.status === 'succeeded' || node.status === 'failed')) {
      const decision = evaluateLoopSettle({
        node: workflowNode,
        nodeRun: node,
        edges: run.edges,
        loopStates: run.loopStates ?? [],
        now: clock.now(),
      });
      if (decision.action === 'iterate') {
        upsertLoopState(run, decision.loopState);
        pushIterationRecords(run, decision.bodyNodeIds, decision.nextIteration);
      } else if (decision.action === 'stop') {
        node.settledPort = decision.settledPortOverride;
        node.loopExit = decision.reason;
        upsertLoopState(run, decision.loopState);
      }
      // `decision.action === 'none'` needs nothing: B's own `settledPort`
      // (already written above) already routes this node's other children
      // correctly, whether or not it ever sourced a loop edge at all.
    }

    await deps.saveRun(run);
    return run;
  });
  // `null` on a not-found run/node or a settle that lost the idempotence
  // race — nothing changed, so nothing to announce.
  if (run) deps.emitChanged(run);
}

/**
 * Stamp an `agent`/`script` node's live `sessionId` onto the run (Phase 95
 * Theme J) — a MID-FLIGHT patch, not a settle: `executors/agent.ts` and
 * `executors/script.ts` call this the moment their pty exists, well before
 * the node finishes, so the terminal accordion group and the canvas node's
 * own glow can bind to a real session while it is still running rather than
 * only once it is done. A no-op if the run vanished or the node already
 * settled — the same guard `settleNode` applies, for the identical reason: a
 * cancel that raced ahead of this write must not resurrect a node's
 * `running`-only field.
 */
async function patchNodeSessionId(
  runId: string,
  nodeId: string,
  sessionId: string,
  deps: EngineDeps,
): Promise<void> {
  const run = await withRunLock(runId, async () => {
    const run = await deps.getRun(runId);
    if (!run) return null;
    // `activeNodeRun` — see `settleNode`'s identical comment.
    const node = activeNodeRun(run, nodeId);
    if (!node || node.status !== 'running') return null;
    node.sessionId = sessionId;
    await deps.saveRun(run);
    return run;
  });
  if (run) deps.emitChanged(run);
}

/**
 * Move a node from `running` to `waiting` (Phase 97 Theme D) — a MID-FLIGHT
 * patch, the identical idiom {@link patchNodeSessionId} above already uses:
 * `executors/gate.ts` calls this the moment it starts, well before its own
 * promise resolves, so the run panel/bell/kill-switch see the pause the
 * instant it begins rather than only once the gate is eventually decided.
 * A no-op if the run vanished or the node already left `running` (a cancel
 * that raced ahead of this write) — the same guard every mid-flight patch in
 * this file applies.
 */
async function patchNodeWaiting(runId: string, nodeId: string, deps: EngineDeps): Promise<void> {
  const run = await withRunLock(runId, async () => {
    const run = await deps.getRun(runId);
    if (!run) return null;
    const node = activeNodeRun(run, nodeId);
    if (!node || node.status !== 'running') return null;
    node.status = 'waiting';
    await deps.saveRun(run);
    return run;
  });
  if (run) deps.emitChanged(run);
}

/**
 * Decide a `gate` node currently `waiting` — the one function every decide
 * channel funnels through (`workflowGateDecide` IPC, the MCP tool, and
 * `gate-forge-service.ts`'s PR-comment poll), each passing its own
 * {@link WorkflowGateDecidedBy}. Resolving the in-memory waiter
 * (`gate-waiters.ts`) is what actually unblocks the gate's own executor
 * promise; `settleNode` (already running as part of `executeNode`'s own
 * await chain) is what then writes the settle onto the run.
 *
 * Read-then-resolve rather than resolve-then-check: `getRun`/`activeNodeRun`
 * exist here only to answer with an honest, specific failure message
 * (`GitOpResult`'s whole point) — `resolveGateWaiter`'s own `false` already
 * covers every case where there is nothing to decide, including a run that
 * no longer exists.
 */
export async function decideWorkflowGate(
  runId: string,
  nodeId: string,
  decision: WorkflowGateDecision,
  note: string | undefined,
  decidedBy: WorkflowGateDecidedBy,
  deps: EngineDeps,
): Promise<GitOpResult> {
  const run = await deps.getRun(runId);
  if (!run) return failure('That run no longer exists.');
  const node = activeNodeRun(run, nodeId);
  if (!node) return failure('That step no longer exists.');
  if (node.status !== 'waiting') return failure('This gate is not waiting for a decision.');

  const resolved = resolveGateWaiter(runId, nodeId, { decision, note, decidedBy });
  if (!resolved) return failure('This gate is not waiting for a decision.');
  return ok();
}
