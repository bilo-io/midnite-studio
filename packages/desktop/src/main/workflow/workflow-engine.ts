import { randomUUID } from 'node:crypto';

import {
  WORKFLOW_NODE_CONCURRENCY,
  WORKFLOW_NODE_TIMEOUT_MS,
  failure,
  findCycleEdge,
  ok,
  validateWorkflow,
  type GitOpResult,
  type Workflow,
  type WorkflowEdge,
  type WorkflowNode,
  type WorkflowNodeRun,
  type WorkflowNodeStatus,
  type WorkflowRun,
} from '@midnite/studio-shared';

import { defaultExecutors } from './executors';
import type { CancelSignal, ExecutorRegistry, NodeOutcome } from './executor-registry';

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
  /** One bare `workflowRunChanged` ping. Never a payload — see `channels.ts`. */
  emitChanged: () => void;
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

function buildGraph(nodeIds: readonly string[], edges: readonly WorkflowEdge[]): Graph {
  const parents = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  const children = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  for (const edge of edges) {
    parents.get(edge.to)?.push(edge.from);
    children.get(edge.from)?.push(edge.to);
  }
  return { parents, children };
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
  if (run.nodes.some((node) => node.status === 'failed' || node.status === 'timeout')) return 'failed';
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
  workflow: Workflow,
  deps: EngineDeps,
): Promise<GitOpResult<WorkflowRun>> {
  const issues = validateWorkflow(workflow);
  if (issues.length > 0) {
    const first = issues[0]!;
    return failure(`This workflow cannot run yet: ${first.message}`);
  }

  const runnable = workflow.nodes.filter((node) => node.kind !== 'note');
  const cycle = findCycleEdge(
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
  deps.emitChanged();

  const state: InFlight = { cancelled: false, done: Promise.resolve() };
  inFlight.set(run.id, state);
  state.done = drive(run.id, runnable, deps, state).finally(() => inFlight.delete(run.id));
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
        const graph = buildGraph(
          run.nodes.map((n) => n.nodeId),
          run.edges,
        );
        const status = new Map(run.nodes.map((n) => [n.nodeId, n.status]));
        const gated = new Map(run.nodes.map((n) => [n.nodeId, n.gatedDownstream === true]));

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
        */
        let mutated = false;
        for (;;) {
          let changedThisPass = false;
          for (const node of run.nodes) {
            if (node.status !== 'pending') continue;
            const parents = graph.parents.get(node.nodeId) ?? [];
            const blocked = parents.find((parent) => {
              const parentStatus = status.get(parent);
              if (parentStatus === 'failed' || parentStatus === 'timeout' || parentStatus === 'skipped') {
                return true;
              }
              return gated.get(parent) === true;
            });
            if (blocked === undefined) continue;
            node.status = 'skipped';
            node.error =
              gated.get(blocked) === true
                ? 'Skipped — a condition upstream did not hold.'
                : 'Skipped — an earlier step did not succeed.';
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
          deps.emitChanged();
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
        const promise = executeNode(runId, node, deps, state, executors).finally(() =>
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
  await withRunLock(runId, async () => {
    const run = await deps.getRun(runId);
    if (!run) return;
    if (state.cancelled) {
      for (const node of run.nodes) {
        if (TERMINAL.has(node.status)) continue;
        node.status = 'skipped';
        node.error = node.error ?? 'Cancelled.';
        node.endedAt = clock.now();
      }
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
  });
  deps.emitChanged();
}

function timeoutFor(node: WorkflowNode, deps: EngineDeps): number {
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
  node: WorkflowNode,
  deps: EngineDeps,
  state: InFlight,
  executors: ExecutorRegistry,
): Promise<void> {
  const outcome = await runNode(runId, node, deps, state, executors, timeoutFor(node, deps));
  await settleNode(runId, node.id, outcome, deps);
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
  node: WorkflowNode,
  deps: EngineDeps,
  state: InFlight,
  executors: ExecutorRegistry,
  timeoutMs: number,
): Promise<{ status: WorkflowNodeStatus; result?: NodeOutcome }> {
  const clock = deps.clock ?? realClock;
  /*
    Only this node's ANCESTORS, not every node that happens to have settled.

    Handing over every settled output made a reference across two unconnected
    branches resolve or fail depending purely on scheduling — `{{b.body.id}}`
    from a node in a different branch worked if `b` won the race and failed if
    it did not, which with a concurrency of 4 flips run to run. Restricting it
    to real ancestors makes both outcomes deterministic and makes
    `interpolate.ts`'s "is not upstream of this one" message literally true.

    Read immediately before the call, under the lock, so a node that waited on
    a join sees everything that landed while it waited.
  */
  const upstream = await withRunLock(runId, async () => {
    const run = await deps.getRun(runId);
    if (!run) return {};
    const graph = buildGraph(
      run.nodes.map((n) => n.nodeId),
      run.edges,
    );
    const ancestors = new Set<string>();
    const queue = [...(graph.parents.get(node.id) ?? [])];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (ancestors.has(id)) continue;
      ancestors.add(id);
      queue.push(...(graph.parents.get(id) ?? []));
    }

    const outputs: Record<string, unknown> = {};
    for (const recorded of run.nodes) {
      if (!ancestors.has(recorded.nodeId)) continue;
      if (recorded.output !== undefined) outputs[recorded.nodeId] = recorded.output;
    }
    return outputs;
  });

  const signal: CancelSignal = { cancelled: () => state.cancelled };
  let settled = false;

  return new Promise((resolve) => {
    const timer = clock.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ status: 'timeout' });
    }, timeoutMs);

    void executors[node.kind](node, { upstream, signal, timeoutMs }).then(
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
): Promise<void> {
  const clock = deps.clock ?? realClock;
  await withRunLock(runId, async () => {
    const run = await deps.getRun(runId);
    if (!run) return;
    const node = run.nodes.find((n) => n.nodeId === nodeId);
    if (!node) return;
    // The idempotence guard, INSIDE the lock: a cancel can race a real settle,
    // and whichever landed first is the one that counts.
    if (node.status !== 'running') return;

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
      /*
        A false predicate is not a failure and not a skip: the `condition` node
        itself ran and answered. What it gates is everything DOWNSTREAM, so the
        gate is its own recorded field rather than a status — marking the
        condition `skipped` would say the step never ran, which is the opposite
        of what happened. The driver's cascade reads exactly this flag.
      */
      if (result.skipDownstream === true) node.gatedDownstream = true;
    } else if (result?.ok === false) {
      node.error = result.error;
    }

    await deps.saveRun(run);
  });
  deps.emitChanged();
}
