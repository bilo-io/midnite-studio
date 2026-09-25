import { beforeEach, describe, expect, it } from 'vitest';

import type { Workflow, WorkflowEdge, WorkflowLoopConfig, WorkflowNode, WorkflowRun } from '@midnite/studio-shared';

import { startFixtureServer, type FixtureServer } from '../demo-api/fixture-server';
import type { ExecutorRegistry, NodeExecutor, NodeOutcome } from './executor-registry';
import { createGateExecutor } from './executors/gate';
import { httpExecutor } from './executors/http';
import { resetGateWaitersForTests } from './gate-waiters';
import {
  cancelWorkflowRun,
  decideWorkflowGate,
  runLocksSizeForTests,
  startWorkflowRun,
  type EngineDeps,
} from './workflow-engine';

/**
 * The engine's own tests run against fake executors and a fake clock — no
 * sockets, no 120-second waits. `http.test.ts` covers the real HTTP path
 * against Theme D's demo API.
 */

// --- fixtures ----------------------------------------------------------------

function delayNode(id: string, ms = 0): WorkflowNode {
  return { id, label: id, x: 0, y: 0, kind: 'delay', config: { ms } };
}

function conditionNode(id: string, left: string, right: string): WorkflowNode {
  return { id, label: id, x: 0, y: 0, kind: 'condition', config: { left, op: 'eq', right } };
}

function workflow(nodes: WorkflowNode[], edges: [string, string][]): Workflow {
  return {
    id: 'w1',
    name: 'Test',
    nodes,
    edges: edges.map(([from, to], i) => ({ id: `e${i}`, from, to })),
    createdAt: 1,
    updatedAt: 1,
  };
}

/** A store that records every write, so a dropped one is visible. */
function makeStore() {
  const runs = new Map<string, WorkflowRun>();
  let writes = 0;
  return {
    writes: () => writes,
    get: (id: string) => runs.get(id),
    saveRun: async (run: WorkflowRun) => {
      writes += 1;
      // Deep-copied on the way in AND out: a store that hands back the same
      // object reference would hide exactly the read-modify-write race these
      // tests exist to catch.
      runs.set(run.id, structuredClone(run));
    },
    getRun: async (runId: string) => {
      const run = runs.get(runId);
      return run ? structuredClone(run) : null;
    },
  };
}

type Recorder = { started: string[]; settled: string[] };

/**
 * A registry whose every kind answers from one scripted table, so a test says
 * what each node does by id rather than by node kind.
 */
function fakeRegistry(
  script: Record<string, () => Promise<NodeOutcome>>,
  recorder: Recorder,
): ExecutorRegistry {
  const executor: NodeExecutor = async (node, context) => {
    recorder.started.push(node.id);
    const run = script[node.id] ?? (async () => ({ ok: true, output: { id: node.id } }));
    const outcome = await run();
    if (context.signal.cancelled()) return { ok: false, error: 'Cancelled.' };
    recorder.settled.push(node.id);
    return outcome;
  };
  return {
    http: executor,
    transform: executor,
    condition: executor,
    delay: executor,
    note: executor,
    agent: executor,
    script: executor,
    // A join never reaches an executor (it settles inline in the driver) —
    // included only so this fixture registry satisfies `ExecutorRegistry`'s
    // exhaustive `Record`.
    join: executor,
    gate: executor,
  };
}

function deps(store: ReturnType<typeof makeStore>, over: Partial<EngineDeps> = {}): EngineDeps {
  return {
    saveRun: store.saveRun,
    getRun: store.getRun,
    emitChanged: () => {},
    ...over,
  };
}

async function settle(): Promise<void> {
  // Two macrotask turns: enough for a run whose executors resolve immediately.
  for (let i = 0; i < 40; i += 1) await new Promise((resolve) => setTimeout(resolve, 1));
}

beforeEach(() => {
  expect(runLocksSizeForTests()).toBe(0);
  resetGateWaitersForTests();
});

// --- the tests ---------------------------------------------------------------

describe('graph traversal', () => {
  it('joins a diamond — the join node runs once, after both branches', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const w = workflow(
      [delayNode('a'), delayNode('b'), delayNode('c'), delayNode('d')],
      [
        ['a', 'b'],
        ['a', 'c'],
        ['b', 'd'],
        ['c', 'd'],
      ],
    );

    const started = await startWorkflowRun(w, deps(store, { executors: fakeRegistry({}, recorder) }));
    expect(started.ok).toBe(true);
    await settle();

    expect(recorder.started.filter((id) => id === 'd')).toHaveLength(1);
    expect(recorder.started.indexOf('d')).toBeGreaterThan(recorder.settled.indexOf('b'));
    expect(recorder.started.indexOf('d')).toBeGreaterThan(recorder.settled.indexOf('c'));

    const run = store.get(started.ok ? started.value.id : '')!;
    expect(run.status).toBe('completed');
    expect(run.nodes.every((n) => n.status === 'succeeded')).toBe(true);
  });

  it('runs independent branches in parallel', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    let concurrent = 0;
    let peak = 0;
    const hold = async (): Promise<NodeOutcome> => {
      concurrent += 1;
      peak = Math.max(peak, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 5));
      concurrent -= 1;
      return { ok: true, output: {} };
    };
    const w = workflow([delayNode('a'), delayNode('b'), delayNode('c')], []);

    await startWorkflowRun(
      w,
      deps(store, { executors: fakeRegistry({ a: hold, b: hold, c: hold }, recorder) }),
    );
    await settle();
    expect(peak).toBeGreaterThan(1);
  });

  it('caps in-flight nodes at four, however wide the fan-out', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    let concurrent = 0;
    let peak = 0;
    const hold = async (): Promise<NodeOutcome> => {
      concurrent += 1;
      peak = Math.max(peak, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 5));
      concurrent -= 1;
      return { ok: true, output: {} };
    };
    const ids = Array.from({ length: 12 }, (_, i) => `n${i}`);
    const script = Object.fromEntries(ids.map((id) => [id, hold]));

    await startWorkflowRun(
      workflow(ids.map((id) => delayNode(id)), []),
      deps(store, { executors: fakeRegistry(script, recorder) }),
    );
    await settle();
    expect(peak).toBeLessThanOrEqual(4);
    expect(recorder.settled).toHaveLength(12);
  });

  it('rejects a cycle before anything runs, naming the edge', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const w = workflow(
      [delayNode('a'), delayNode('b')],
      [
        ['a', 'b'],
        ['b', 'a'],
      ],
    );

    const result = await startWorkflowRun(w, deps(store, { executors: fakeRegistry({}, recorder) }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.kind === 'error' && result.message).toContain('cycle');
    // Not a hang, and not a half-started run.
    expect(recorder.started).toEqual([]);
    expect(store.writes()).toBe(0);
  });
});

describe('failure propagation', () => {
  it('marks every dependant of a failed node skipped', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const w = workflow(
      [delayNode('a'), delayNode('b'), delayNode('c'), delayNode('d')],
      [
        ['a', 'b'],
        ['b', 'c'],
        ['a', 'd'],
      ],
    );

    const started = await startWorkflowRun(
      w,
      deps(store, {
        executors: fakeRegistry({ b: async () => ({ ok: false, error: 'boom' }) }, recorder),
      }),
    );
    await settle();

    const run = store.get(started.ok ? started.value.id : '')!;
    const byId = Object.fromEntries(run.nodes.map((n) => [n.nodeId, n]));
    expect(byId.a!.status).toBe('succeeded');
    expect(byId.b!.status).toBe('failed');
    expect(byId.c!.status).toBe('skipped');
    // `d` is on the other branch and unaffected — a failure skips dependants,
    // not the whole run.
    expect(byId.d!.status).toBe('succeeded');
    expect(run.status).toBe('failed');
    expect(recorder.started).not.toContain('c');
  });

  it('a false condition gates downstream without claiming it did not run', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const w = workflow([conditionNode('gate', 'a', 'b'), delayNode('after')], [['gate', 'after']]);

    const started = await startWorkflowRun(
      w,
      deps(store, {
        executors: fakeRegistry(
          { gate: async () => ({ ok: true, output: { passed: false }, port: 'false' }) },
          recorder,
        ),
      }),
    );
    await settle();

    const run = store.get(started.ok ? started.value.id : '')!;
    const gate = run.nodes.find((n) => n.nodeId === 'gate')!;
    const after = run.nodes.find((n) => n.nodeId === 'after')!;
    expect(gate.status).toBe('succeeded');
    expect(gate.settledPort).toBe('false');
    expect(after.status).toBe('skipped');
    expect(after.error).toContain('true');
    // Nothing failed, so the run completed — a branch that did not apply is
    // not a broken run.
    expect(run.status).toBe('completed');
  });

  it('treats an executor that throws as a failure rather than taking main down', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const started = await startWorkflowRun(
      workflow([delayNode('a')], []),
      deps(store, {
        executors: fakeRegistry(
          {
            a: async () => {
              throw new Error('executor bug');
            },
          },
          recorder,
        ),
      }),
    );
    await settle();

    const run = store.get(started.ok ? started.value.id : '')!;
    expect(run.nodes[0]!.status).toBe('failed');
    expect(run.nodes[0]!.error).toContain('Executor error: executor bug');
  });
});

describe('timeouts', () => {
  it('times a hung node out without blocking its siblings', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const never = () => new Promise<NodeOutcome>(() => {});
    const w = workflow([delayNode('hung'), delayNode('fine')], []);

    // The injected clock is what makes the 120-second default testable in
    // milliseconds — no fake timers, which fight real promise scheduling.
    const started = await startWorkflowRun(
      w,
      deps(store, {
        executors: fakeRegistry({ hung: never }, recorder),
        clock: {
          now: () => Date.now(),
          setTimeout: (fn, _ms) => {
            const timer = setTimeout(fn, 20);
            timer.unref?.();
            return timer;
          },
          clearTimeout: ((handle: never) => clearTimeout(handle)) as never,
        },
      }),
    );
    await settle();

    const run = store.get(started.ok ? started.value.id : '')!;
    const byId = Object.fromEntries(run.nodes.map((n) => [n.nodeId, n]));
    expect(byId.hung!.status).toBe('timeout');
    expect(byId.hung!.error).toBe('Timed out.');
    expect(byId.fine!.status).toBe('succeeded');
    expect(run.status).toBe('failed');
  });

  it("uses deps.defaultTimeoutMs (Theme I's settings page) for a node with no override of its own", async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const w = workflow([delayNode('a')], []);
    const seenDeadlines: number[] = [];

    await startWorkflowRun(
      w,
      deps(store, {
        executors: fakeRegistry({}, recorder),
        defaultTimeoutMs: 5_000,
        clock: {
          now: () => Date.now(),
          setTimeout: (fn, ms) => {
            seenDeadlines.push(ms);
            const timer = setTimeout(fn, 0);
            timer.unref?.();
            return timer;
          },
          clearTimeout: ((handle: never) => clearTimeout(handle)) as never,
        },
      }),
    );
    await settle();

    expect(seenDeadlines).toEqual([5_000]);
  });
});

describe('cancellation', () => {
  it('leaves zero nodes pending and zero running', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const slow = () => new Promise<NodeOutcome>((resolve) => {
      const timer = setTimeout(() => resolve({ ok: true, output: {} }), 300);
      timer.unref?.();
    });
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const w = workflow(
      ids.map((id) => delayNode(id)),
      [
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'd'],
        ['d', 'e'],
      ],
    );

    const started = await startWorkflowRun(
      w,
      deps(store, { executors: fakeRegistry(Object.fromEntries(ids.map((i) => [i, slow])), recorder) }),
    );
    expect(started.ok).toBe(true);
    const runId = started.ok ? started.value.id : '';

    await new Promise((resolve) => setTimeout(resolve, 20));
    const cancelled = await cancelWorkflowRun(runId, deps(store));
    expect(cancelled.ok).toBe(true);

    const run = store.get(runId)!;
    expect(run.status).toBe('cancelled');
    expect(run.nodes.filter((n) => n.status === 'pending')).toHaveLength(0);
    expect(run.nodes.filter((n) => n.status === 'running')).toHaveLength(0);
    expect(run.endedAt).toBeDefined();
  });

  it('refuses to cancel a run that already finished', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const started = await startWorkflowRun(
      workflow([delayNode('a')], []),
      deps(store, { executors: fakeRegistry({}, recorder) }),
    );
    await settle();
    const result = await cancelWorkflowRun(started.ok ? started.value.id : '', deps(store));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.kind === 'error' && result.message).toContain('already finished');
  });
});

describe('the per-run lock', () => {
  it('does not drop a write when twenty nodes settle at once', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const ids = Array.from({ length: 20 }, (_, i) => `n${i}`);
    // Every node settles on the same turn — the read-modify-write race that
    // `withRunLock` exists to serialise. Without the lock, later settles read a
    // stale run and the recorded outcomes come up short.
    const script = Object.fromEntries(
      ids.map((id) => [id, async (): Promise<NodeOutcome> => ({ ok: true, output: { id } })]),
    );

    const started = await startWorkflowRun(
      workflow(ids.map((id) => delayNode(id)), []),
      deps(store, { executors: fakeRegistry(script, recorder) }),
    );
    await settle();

    const run = store.get(started.ok ? started.value.id : '')!;
    expect(run.nodes.filter((n) => n.status === 'succeeded')).toHaveLength(20);
    expect(run.nodes.filter((n) => n.output !== undefined)).toHaveLength(20);
  });

  it('holds no lock entries once a run reaches a terminal state', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    await startWorkflowRun(
      workflow([delayNode('a'), delayNode('b')], [['a', 'b']]),
      deps(store, { executors: fakeRegistry({}, recorder) }),
    );
    await settle();
    // The leak the councils original would have had without `evictIfCurrent`:
    // one map entry per run, for the life of the process.
    expect(runLocksSizeForTests()).toBe(0);
  });
});

describe('the frozen snapshot', () => {
  it('executes the graph as it was at run start, not as it is now', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const w = workflow([delayNode('a'), delayNode('b')], [['a', 'b']]);

    const started = await startWorkflowRun(
      w,
      deps(store, {
        executors: fakeRegistry(
          { a: async () => new Promise((r) => setTimeout(() => r({ ok: true, output: {} }), 15)) },
          recorder,
        ),
      }),
    );
    // Editing the live workflow mid-run must not reach the run.
    w.nodes.push(delayNode('c'));
    w.edges.push({ id: 'e9', from: 'b', to: 'c' });
    await settle();

    const run = store.get(started.ok ? started.value.id : '')!;
    expect(run.nodes.map((n) => n.nodeId)).toEqual(['a', 'b']);
    expect(recorder.started).not.toContain('c');
  });

  it('persists the run before the first node launches', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const started = await startWorkflowRun(
      workflow([delayNode('a')], []),
      deps(store, { executors: fakeRegistry({}, recorder) }),
    );
    expect(started.ok).toBe(true);
    // Written and readable the moment `startWorkflowRun` resolves — a settle
    // that landed first would otherwise have nowhere to write.
    expect(store.get(started.ok ? started.value.id : '')).toBeDefined();
  });

  it('leaves notes out of the run entirely', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const started = await startWorkflowRun(
      workflow(
        [delayNode('a'), { id: 'n', label: 'Why', x: 0, y: 0, kind: 'note', config: { text: '' } }],
        [],
      ),
      deps(store, { executors: fakeRegistry({}, recorder) }),
    );
    await settle();
    const run = store.get(started.ok ? started.value.id : '')!;
    expect(run.nodes.map((n) => n.nodeId)).toEqual(['a']);
  });
});

describe('validation', () => {
  it('refuses to start an invalid workflow, quoting the issue', async () => {
    const store = makeStore();
    const invalid: Workflow = {
      ...workflow([], []),
      nodes: [
        { id: 'h', label: 'Fetch', x: 0, y: 0, kind: 'http', config: { method: 'GET', url: '', headers: {}, params: {}, queryShaped: false } },
      ],
    };
    const result = await startWorkflowRun(invalid, deps(store));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.kind === 'error' && result.message).toContain('has no URL');
    expect(store.writes()).toBe(0);
  });
});

describe('upstream outputs', () => {
  it('hands a node every ancestor output, keyed by node id', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    let seen: Record<string, unknown> | null = null;
    const capture: NodeExecutor = async (_node, context) => {
      seen = context.upstream;
      return { ok: true, output: {} };
    };
    const registry = fakeRegistry(
      { a: async () => ({ ok: true, output: { token: 'abc' } }) },
      recorder,
    );

    const started = await startWorkflowRun(
      workflow(
        [
          delayNode('a'),
          { id: 'b', label: 'b', x: 0, y: 0, kind: 'transform', config: { picks: [{ from: 'a.token', to: 't' }] } },
        ],
        [['a', 'b']],
      ),
      // Only the `transform` kind captures, so `a` still runs the scripted
      // executor and `b` sees what `a` produced.
      deps(store, { executors: { ...registry, transform: capture } }),
    );
    expect(started.ok).toBe(true);
    await settle();

    expect(seen).toEqual({ a: { token: 'abc' } });
  });

  it('reads upstream fresh, so a node that waited sees what landed while it waited', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    let seen: Record<string, unknown> | null = null;
    const capture: NodeExecutor = async (_node, context) => {
      seen = context.upstream;
      return { ok: true, output: {} };
    };
    const registry = fakeRegistry(
      {
        a: async () => ({ ok: true, output: { first: 1 } }),
        // `b` finishes late, after `c` has already been waiting on the join.
        b: () =>
          new Promise((resolve) => {
            const timer = setTimeout(() => resolve({ ok: true, output: { second: 2 } }), 15);
            timer.unref?.();
          }),
      },
      recorder,
    );

    const started = await startWorkflowRun(
      workflow(
        [
          delayNode('a'),
          delayNode('b'),
          { id: 'c', label: 'c', x: 0, y: 0, kind: 'transform', config: { picks: [{ from: 'a.first', to: 'f' }] } },
        ],
        [
          ['a', 'c'],
          ['b', 'c'],
        ],
      ),
      deps(store, { executors: { ...registry, transform: capture } }),
    );
    expect(started.ok).toBe(true);
    await settle();

    expect(seen).toEqual({ a: { first: 1 }, b: { second: 2 } });
  });
});

describe('the terminal write', () => {
  it('still closes the run out when the driver throws mid-flight', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    let throwOnce = false;
    const brittle: EngineDeps = {
      ...deps(store, { executors: fakeRegistry({}, recorder) }),
      getRun: async (runId) => {
        if (throwOnce) {
          throwOnce = false;
          throw new Error('read failed');
        }
        return store.getRun(runId);
      },
    };

    const started = await startWorkflowRun(
      workflow([delayNode('a'), delayNode('b')], [['a', 'b']]),
      brittle,
    );
    expect(started.ok).toBe(true);
    throwOnce = true;
    await settle();

    /*
      Whatever broke, the run must not be left `running` with nobody left to
      advance it — the next launch would otherwise "finalise" it as interrupted,
      which is a lie about what happened. The write itself is not what this
      guards: the real stores swallow their own errors, so `saveRun` does not
      throw. What can throw is the driver's own read-modify-write.
    */
    const run = store.get(started.ok ? started.value.id : '')!;
    expect(run.status).toBe('failed');
    expect(run.error).toBe('read failed');
    expect(run.endedAt).toBeDefined();
    expect(run.nodes.every((node) => node.status !== 'pending' && node.status !== 'running')).toBe(
      true,
    );
    expect(runLocksSizeForTests()).toBe(0);
  });

  it('records an executor-reported timeout as `timeout`, with its own message', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const started = await startWorkflowRun(
      workflow([delayNode('a')], []),
      deps(store, {
        executors: fakeRegistry(
          { a: async () => ({ ok: false, error: 'Timed out after 5000 ms.', timedOut: true }) },
          recorder,
        ),
      }),
    );
    await settle();

    const node = store.get(started.ok ? started.value.id : '')!.nodes[0]!;
    expect(node.status).toBe('timeout');
    expect(node.error).toBe('Timed out after 5000 ms.');
  });
});

describe('the skip cascade, regardless of node array order', () => {
  // `workflow.nodes` order is drop order on the canvas, so a user who places
  // C, then B, then A and wires a→b→c produces exactly this array. A cascade
  // that is one pass in array order marks `b` skipped, writes that into the
  // status map, and then finds `c` eligible — because `skipped` is terminal —
  // so `c` RUNS under a failed grandparent. If `c` is an http node that is a
  // real request that should never have been sent.
  it.each([
    ['a,b,c', ['a', 'b', 'c']],
    ['c,b,a', ['c', 'b', 'a']],
    ['b,c,a', ['b', 'c', 'a']],
  ])('skips a grandchild of a failed node with node order %s', async (_label, order) => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const w = workflow(
      order.map((id) => delayNode(id)),
      [
        ['a', 'b'],
        ['b', 'c'],
      ],
    );

    const started = await startWorkflowRun(
      w,
      deps(store, {
        executors: fakeRegistry({ a: async () => ({ ok: false, error: 'boom' }) }, recorder),
      }),
    );
    await settle();

    const run = store.get(started.ok ? started.value.id : '')!;
    const byId = Object.fromEntries(run.nodes.map((n) => [n.nodeId, n]));
    expect(byId.a!.status).toBe('failed');
    expect(byId.b!.status).toBe('skipped');
    expect(byId.c!.status).toBe('skipped');
    expect(recorder.started).toEqual(['a']);
  });

  it('skips a grandchild behind a false condition whatever the node order', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const w = workflow(
      [delayNode('c'), delayNode('b'), conditionNode('gate', 'x', 'y')],
      [
        ['gate', 'b'],
        ['b', 'c'],
      ],
    );

    const started = await startWorkflowRun(
      w,
      deps(store, {
        executors: fakeRegistry(
          { gate: async () => ({ ok: true, output: { passed: false }, port: 'false' }) },
          recorder,
        ),
      }),
    );
    await settle();

    const run = store.get(started.ok ? started.value.id : '')!;
    const byId = Object.fromEntries(run.nodes.map((n) => [n.nodeId, n]));
    expect(byId.b!.status).toBe('skipped');
    expect(byId.c!.status).toBe('skipped');
    expect(recorder.started).toEqual(['gate']);
  });
});

describe('upstream is ancestry, not whatever settled', () => {
  it('does not hand a node the output of an unconnected branch', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    let seen: Record<string, unknown> | null = null;
    const capture: NodeExecutor = async (_node, context) => {
      seen = context.upstream;
      return { ok: true, output: {} };
    };
    const registry = fakeRegistry(
      {
        a: async () => ({ ok: true, output: { from: 'a' } }),
        // `b` settles fast, so with a scheduling-dependent "every settled
        // output" upstream it would be visible to `d` — coupling two branches
        // the graph never connected, and doing so only sometimes.
        b: async () => ({ ok: true, output: { from: 'b' } }),
        c: () =>
          new Promise((resolve) => {
            const timer = setTimeout(() => resolve({ ok: true, output: { from: 'c' } }), 15);
            timer.unref?.();
          }),
      },
      recorder,
    );

    const started = await startWorkflowRun(
      workflow(
        [
          delayNode('a'),
          delayNode('b'),
          delayNode('c'),
          { id: 'd', label: 'd', x: 0, y: 0, kind: 'transform', config: { picks: [{ from: 'c.from', to: 'f' }] } },
        ],
        [
          ['a', 'b'],
          ['c', 'd'],
        ],
      ),
      deps(store, { executors: { ...registry, transform: capture } }),
    );
    expect(started.ok).toBe(true);
    await settle();

    // Only `c`, `d`'s single ancestor. Not `a` and not `b`.
    expect(seen).toEqual({ c: { from: 'c' } });
  });

  it('hands a node every ancestor, not just its direct parents', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    let seen: Record<string, unknown> | null = null;
    const capture: NodeExecutor = async (_node, context) => {
      seen = context.upstream;
      return { ok: true, output: {} };
    };
    const registry = fakeRegistry(
      {
        a: async () => ({ ok: true, output: { from: 'a' } }),
        b: async () => ({ ok: true, output: { from: 'b' } }),
      },
      recorder,
    );

    const started = await startWorkflowRun(
      workflow(
        [
          delayNode('a'),
          delayNode('b'),
          { id: 'c', label: 'c', x: 0, y: 0, kind: 'transform', config: { picks: [{ from: 'a.from', to: 'f' }] } },
        ],
        [
          ['a', 'b'],
          ['b', 'c'],
        ],
      ),
      deps(store, { executors: { ...registry, transform: capture } }),
    );
    expect(started.ok).toBe(true);
    await settle();

    // A grandparent is still upstream — `{{a.from}}` two hops down must work.
    expect(seen).toEqual({ a: { from: 'a' }, b: { from: 'b' } });
  });
});

// --- Theme B: join, routing, the error port ----------------------------------

function joinNode(id: string, mode: 'all' | 'any' | 'allSettled', inputs: number): WorkflowNode {
  return { id, label: id, x: 0, y: 0, kind: 'join', config: { mode, inputs } };
}

function transformNode(id: string, from: string, to: string): WorkflowNode {
  return { id, label: id, x: 0, y: 0, kind: 'transform', config: { picks: [{ from, to }] } };
}

/** A raw `Workflow` builder for tests that need explicit `toPort`/`fromPort`/`kind` on edges. */
function typedWorkflow(nodes: WorkflowNode[], edges: WorkflowEdge[]): Workflow {
  return { id: 'w1', name: 'Test', nodes, edges, createdAt: 1, updatedAt: 1 };
}

describe('join (Theme B)', () => {
  it("mode 'all' waits for every input and joins their outputs in port order", async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const w = typedWorkflow(
      [delayNode('a'), delayNode('b'), joinNode('j', 'all', 2)],
      [
        { id: 'e1', from: 'a', to: 'j', toPort: 'in-1' },
        { id: 'e2', from: 'b', to: 'j', toPort: 'in-2' },
      ],
    );

    const started = await startWorkflowRun(
      w,
      deps(store, {
        executors: fakeRegistry(
          { a: async () => ({ ok: true, output: { id: 'a' } }), b: async () => ({ ok: true, output: { id: 'b' } }) },
          recorder,
        ),
      }),
    );
    await settle();

    const run = store.get(started.ok ? started.value.id : '')!;
    const j = run.nodes.find((n) => n.nodeId === 'j')!;
    expect(j.status).toBe('succeeded');
    expect(j.settledPort).toBe('out');
    expect(j.output).toEqual({ results: [{ id: 'a' }, { id: 'b' }] });
    expect(run.status).toBe('completed');
  });

  it("mode 'all' fails, with an error naming the input that was not taken, if any input fails", async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const w = typedWorkflow(
      [delayNode('a'), delayNode('b'), joinNode('j', 'all', 2), delayNode('after')],
      [
        { id: 'e1', from: 'a', to: 'j', toPort: 'in-1' },
        { id: 'e2', from: 'b', to: 'j', toPort: 'in-2' },
        { id: 'e3', from: 'j', to: 'after' },
      ],
    );

    const started = await startWorkflowRun(
      w,
      deps(store, {
        executors: fakeRegistry(
          {
            a: async () => ({ ok: true, output: { id: 'a' } }),
            b: async () => ({ ok: false, error: 'boom' }),
          },
          recorder,
        ),
      }),
    );
    await settle();

    const run = store.get(started.ok ? started.value.id : '')!;
    const byId = Object.fromEntries(run.nodes.map((n) => [n.nodeId, n]));
    expect(byId.j!.status).toBe('failed');
    expect(byId.j!.error).toContain('in-2');
    // No error edge wired off `j`, so the legacy cascade applies to its own
    // dependants exactly as it does for any other failed node.
    expect(byId.after!.status).toBe('skipped');
  });

  it("mode 'any' settles the instant one input is taken — the slower sibling keeps running, uncancelled", async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const w = typedWorkflow(
      [delayNode('fast'), delayNode('slow'), joinNode('j', 'any', 2)],
      [
        { id: 'e1', from: 'fast', to: 'j', toPort: 'in-1' },
        { id: 'e2', from: 'slow', to: 'j', toPort: 'in-2' },
      ],
    );

    const started = await startWorkflowRun(
      w,
      deps(store, {
        executors: fakeRegistry(
          {
            fast: async () => ({ ok: true, output: { id: 'fast' } }),
            slow: () =>
              new Promise((resolve) => {
                const timer = setTimeout(() => resolve({ ok: true, output: { id: 'slow' } }), 15);
                timer.unref?.();
              }),
          },
          recorder,
        ),
      }),
    );
    await settle();

    const run = store.get(started.ok ? started.value.id : '')!;
    const byId = Object.fromEntries(run.nodes.map((n) => [n.nodeId, n]));
    expect(byId.j!.status).toBe('succeeded');
    expect(byId.j!.output).toEqual({ result: { id: 'fast' }, from: 'fast' });
    // Nothing cancels the sibling — it ran to its own real completion.
    expect(byId.slow!.status).toBe('succeeded');
  });

  it("mode 'allSettled' always waits for every input and always succeeds, splitting fulfilled/rejected", async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const w = typedWorkflow(
      [delayNode('a'), delayNode('b'), joinNode('j', 'allSettled', 2)],
      [
        { id: 'e1', from: 'a', to: 'j', toPort: 'in-1' },
        { id: 'e2', from: 'b', to: 'j', toPort: 'in-2' },
      ],
    );

    const started = await startWorkflowRun(
      w,
      deps(store, {
        executors: fakeRegistry(
          {
            a: async () => ({ ok: true, output: { id: 'a' } }),
            b: async () => ({ ok: false, error: 'boom' }),
          },
          recorder,
        ),
      }),
    );
    await settle();

    const run = store.get(started.ok ? started.value.id : '')!;
    const j = run.nodes.find((n) => n.nodeId === 'j')!;
    expect(j.status).toBe('succeeded');
    expect(j.output).toEqual({ fulfilled: [{ id: 'a' }], rejected: [{ nodeId: 'b', portId: 'in-2' }] });
  });

  it('names the node with a join that has nothing wired to it', async () => {
    const store = makeStore();
    const w = typedWorkflow([joinNode('j', 'all', 2)], []);
    const result = await startWorkflowRun(w, deps(store));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.kind === 'error' && result.message).toContain('nothing to join');
  });
});

describe('the error port (Theme B)', () => {
  it('routes a failed node through its wired error edge instead of skipping the dependant', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    let seen: Record<string, unknown> | null = null;
    const capture: NodeExecutor = async (_node, context) => {
      seen = context.upstream;
      return { ok: true, output: {} };
    };
    const w = typedWorkflow(
      [delayNode('a'), transformNode('recover', 'a.message', 'm')],
      [{ id: 'e1', from: 'a', to: 'recover', fromPort: 'error', toPort: 'in', kind: 'error' }],
    );

    const started = await startWorkflowRun(
      w,
      deps(store, {
        executors: {
          ...fakeRegistry({ a: async () => ({ ok: false, error: 'boom' }) }, recorder),
          transform: capture,
        },
      }),
    );
    await settle();

    const run = store.get(started.ok ? started.value.id : '')!;
    const byId = Object.fromEntries(run.nodes.map((n) => [n.nodeId, n]));
    expect(byId.a!.status).toBe('failed');
    expect(byId.a!.settledPort).toBe('error');
    expect(byId.a!.output).toEqual({ message: 'boom', status: 500 });
    // The recovery node actually ran — not skipped — and its upstream carries
    // the failure's own `{message, status}` error-port payload.
    expect(byId.recover!.status).toBe('succeeded');
    expect(seen).toEqual({ a: { message: 'boom', status: 500 } });
  });

  it('still cascades the legacy way when a failed node has no wired error edge', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const w = workflow([delayNode('a'), delayNode('b')], [['a', 'b']]);

    const started = await startWorkflowRun(
      w,
      deps(store, { executors: fakeRegistry({ a: async () => ({ ok: false, error: 'boom' }) }, recorder) }),
    );
    await settle();

    const run = store.get(started.ok ? started.value.id : '')!;
    const byId = Object.fromEntries(run.nodes.map((n) => [n.nodeId, n]));
    expect(byId.a!.settledPort).toBeUndefined();
    expect(byId.b!.status).toBe('skipped');
  });

  it("only a true/false branch that actually fired runs — the other is skipped, not silently run", async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const w = typedWorkflow(
      [conditionNode('gate', 'x', 'y'), delayNode('onTrue'), delayNode('onFalse')],
      [
        { id: 'e1', from: 'gate', to: 'onTrue', fromPort: 'true', kind: 'conditional' },
        { id: 'e2', from: 'gate', to: 'onFalse', fromPort: 'false', kind: 'conditional' },
      ],
    );

    const started = await startWorkflowRun(
      w,
      deps(store, {
        executors: fakeRegistry({ gate: async () => ({ ok: true, output: { passed: true }, port: 'true' }) }, recorder),
      }),
    );
    await settle();

    const run = store.get(started.ok ? started.value.id : '')!;
    const byId = Object.fromEntries(run.nodes.map((n) => [n.nodeId, n]));
    expect(byId.onTrue!.status).toBe('succeeded');
    expect(byId.onFalse!.status).toBe('skipped');
    expect(byId.onFalse!.error).toContain('false');
    expect(recorder.started).toEqual(['gate', 'onTrue']);
  });
});

// --- Phase 97 Theme C: controlled cycles --------------------------------------

describe('controlled cycles (Theme C)', () => {
  /**
   * build -> verify -> decide -[true]-> done
   *                       \-[loop,false]-> build
   *                        \-[exhausted]-> gate
   *
   * `decide`'s own script controls which port it settles on (Theme B's
   * `NodeOutcome.port`) — the fake registry bypasses the real `condition`
   * executor entirely, so a test script returning `port: 'false'` IS "the
   * predicate failed", exactly like `conditionExecutor` itself would report.
   */
  function loopWorkflow(loopOver: Partial<WorkflowLoopConfig> = {}): Workflow {
    return {
      id: 'w1',
      name: 'Loop',
      nodes: [
        delayNode('build'),
        delayNode('verify'),
        conditionNode('decide', '{{verify.passed}}', 'true'),
        delayNode('done'),
        delayNode('gate'),
      ],
      edges: [
        { id: 'e1', from: 'build', to: 'verify' },
        { id: 'e2', from: 'verify', to: 'decide' },
        { id: 'e3', from: 'decide', to: 'done', fromPort: 'true', kind: 'conditional' },
        {
          id: 'loop1',
          from: 'decide',
          to: 'build',
          fromPort: 'false',
          kind: 'loop',
          loop: { maxIterations: 3, budgetMs: 3_600_000, ...loopOver },
        },
        { id: 'e4', from: 'decide', to: 'gate', fromPort: 'exhausted', toPort: 'in', kind: 'conditional' },
      ],
      createdAt: 1,
      updatedAt: 1,
    };
  }

  it('passes on attempt 2: build/verify/decide each run twice, done runs once, gate never runs', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    let decideCalls = 0;
    const script: Record<string, () => Promise<NodeOutcome>> = {
      decide: async () => {
        decideCalls += 1;
        return decideCalls === 1
          ? { ok: true, output: { passed: false }, port: 'false' }
          : { ok: true, output: { passed: true }, port: 'true' };
      },
    };

    const started = await startWorkflowRun(loopWorkflow(), deps(store, { executors: fakeRegistry(script, recorder) }));
    expect(started.ok).toBe(true);
    await settle();

    expect(recorder.started.filter((id) => id === 'build')).toHaveLength(2);
    expect(recorder.started.filter((id) => id === 'verify')).toHaveLength(2);
    expect(recorder.started.filter((id) => id === 'decide')).toHaveLength(2);
    expect(recorder.started.filter((id) => id === 'done')).toHaveLength(1);
    expect(recorder.started.filter((id) => id === 'gate')).toHaveLength(0);

    const run = store.get(started.ok ? started.value.id : '')!;
    expect(run.status).toBe('completed');
    expect(run.nodes.find((n) => n.nodeId === 'done')?.status).toBe('succeeded');
    expect(run.nodes.find((n) => n.nodeId === 'gate')?.status).toBe('skipped');
  });

  it('terminates at maxIterations, taking the exhausted port instead of looping forever', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const script: Record<string, () => Promise<NodeOutcome>> = {
      // Always "fails" — never converges on its own.
      decide: async () => ({ ok: true, output: { passed: false }, port: 'false' }),
    };

    const started = await startWorkflowRun(
      loopWorkflow({ maxIterations: 2 }),
      deps(store, { executors: fakeRegistry(script, recorder) }),
    );
    expect(started.ok).toBe(true);
    await settle();

    // Exactly maxIterations (2) passes through the body — the loop does not
    // run forever even though `decide` never once "passes".
    expect(recorder.started.filter((id) => id === 'build')).toHaveLength(2);
    expect(recorder.started.filter((id) => id === 'decide')).toHaveLength(2);
    expect(recorder.started.filter((id) => id === 'gate')).toHaveLength(1);
    expect(recorder.started.filter((id) => id === 'done')).toHaveLength(0);

    const run = store.get(started.ok ? started.value.id : '')!;
    const decideRecords = run.nodes.filter((n) => n.nodeId === 'decide');
    const lastDecide = decideRecords[decideRecords.length - 1]!;
    expect(lastDecide.loopExit).toBe('max-iterations');
    expect(lastDecide.settledPort).toBe('exhausted');
    expect(run.loopStates).toHaveLength(1);
    expect(run.loopStates![0]!.exitReason).toBe('max-iterations');
    expect(run.nodes.find((n) => n.nodeId === 'gate')?.status).toBe('succeeded');
    expect(run.nodes.find((n) => n.nodeId === 'done')?.status).toBe('skipped');
  });

  it('stops on budget with an injected clock, even under maxIterations', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const script: Record<string, () => Promise<NodeOutcome>> = {
      decide: async () => ({ ok: true, output: { passed: false }, port: 'false' }),
    };
    // Every `now()` call jumps 1s forward — the second settle of `decide`
    // sees far more than `budgetMs` elapsed since the loop's own start.
    let tick = 0;
    const started = await startWorkflowRun(
      loopWorkflow({ maxIterations: 10, budgetMs: 50 }),
      deps(store, {
        executors: fakeRegistry(script, recorder),
        clock: {
          now: () => {
            tick += 1000;
            return tick;
          },
          setTimeout: (fn, _ms) => {
            const timer = setTimeout(fn, 0);
            timer.unref?.();
            return timer;
          },
          clearTimeout: ((handle: never) => clearTimeout(handle)) as never,
        },
      }),
    );
    expect(started.ok).toBe(true);
    await settle();

    const run = store.get(started.ok ? started.value.id : '')!;
    expect(run.loopStates).toHaveLength(1);
    expect(run.loopStates![0]!.exitReason).toBe('budget');
    expect(run.nodes.find((n) => n.nodeId === 'gate')?.status).toBe('succeeded');
    // Stopped well short of the 10-iteration cap.
    expect(recorder.started.filter((id) => id === 'decide').length).toBeLessThan(10);
  });

  it('converges on a repeated dry-rounds key rather than looping forever, taking the alternate (non-exhausted) port', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const script: Record<string, () => Promise<NodeOutcome>> = {
      // Always "rejects", and always the SAME idea — nothing new is ever produced.
      decide: async () => ({ ok: true, output: { passed: false, idea: { id: 'x1' } }, port: 'false' }),
    };

    const started = await startWorkflowRun(
      loopWorkflow({
        maxIterations: 20,
        convergence: { kind: 'dry-rounds', rounds: 2, keyPath: 'idea.id' },
      }),
      deps(store, { executors: fakeRegistry(script, recorder) }),
    );
    expect(started.ok).toBe(true);
    await settle();

    // Round 1 (fresh key) + 2 repeats to reach a dryStreak of `rounds` (2).
    expect(recorder.started.filter((id) => id === 'decide')).toHaveLength(3);

    const run = store.get(started.ok ? started.value.id : '')!;
    expect(run.status).toBe('completed');
    expect(run.loopStates).toHaveLength(1);
    expect(run.loopStates![0]!.exitReason).toBe('converged');
    const decideRecords = run.nodes.filter((n) => n.nodeId === 'decide');
    expect(decideRecords[decideRecords.length - 1]!.loopExit).toBe('converged');
    // `decide`'s single non-loop, non-error out-port is `true` — converged
    // takes that (not `exhausted`), so `done` runs and `gate` does not.
    expect(run.nodes.find((n) => n.nodeId === 'done')?.status).toBe('succeeded');
    expect(run.nodes.find((n) => n.nodeId === 'gate')?.status).toBe('skipped');
  });

  it('cancels mid-iteration: no node left pending or running, and the open loop is marked cancelled', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const slow = () =>
      new Promise<NodeOutcome>((resolve) => {
        const timer = setTimeout(() => resolve({ ok: true, output: {} }), 300);
        timer.unref?.();
      });
    const script: Record<string, () => Promise<NodeOutcome>> = {
      build: slow,
      decide: async () => ({ ok: true, output: { passed: false }, port: 'false' }),
    };

    const started = await startWorkflowRun(loopWorkflow(), deps(store, { executors: fakeRegistry(script, recorder) }));
    expect(started.ok).toBe(true);
    const runId = started.ok ? started.value.id : '';

    // Let the first pass reach `build` (slow) mid-flight, then cancel.
    await new Promise((resolve) => setTimeout(resolve, 20));
    const cancelled = await cancelWorkflowRun(runId, deps(store));
    expect(cancelled.ok).toBe(true);

    const run = store.get(runId)!;
    expect(run.status).toBe('cancelled');
    expect(run.nodes.filter((n) => n.status === 'pending')).toHaveLength(0);
    expect(run.nodes.filter((n) => n.status === 'running')).toHaveLength(0);
  });

  it('still rejects a cycle made only of non-loop edges', async () => {
    const store = makeStore();
    const w: Workflow = {
      id: 'w3',
      name: 'Bad cycle',
      nodes: [delayNode('a'), delayNode('b'), delayNode('c')],
      edges: [
        { id: 'e1', from: 'a', to: 'b' },
        { id: 'e2', from: 'b', to: 'c' },
        { id: 'e3', from: 'c', to: 'a' }, // no `kind: 'loop'` — a plain data-edge cycle.
      ],
      createdAt: 1,
      updatedAt: 1,
    };
    const started = await startWorkflowRun(w, deps(store, { executors: fakeRegistry({}, { started: [], settled: [] }) }));
    expect(started.ok).toBe(false);
    expect(!started.ok && started.kind === 'error' && started.message).toContain('cycle');
  });
});

function httpDemoNode(id: string, url = '{{demo.baseUrl}}/items'): WorkflowNode {
  return { id, label: id, x: 0, y: 0, kind: 'http', config: { method: 'GET', url, headers: {}, params: {}, queryShaped: false } };
}

/**
 * `{{demo.baseUrl}}` (Phase 97 Theme M) with the real `httpExecutor` swapped
 * in for the `http` kind — every other kind stays the fake registry, since
 * these two tests are only about the reserved `demo` root the engine injects
 * into `upstream`, not about routing or joins.
 */
describe('demo API interpolation (Phase 97 Theme M)', () => {
  it('resolves {{demo.baseUrl}} against the running demo API', async () => {
    const api: FixtureServer = await startFixtureServer();
    try {
      const store = makeStore();
      const recorder: Recorder = { started: [], settled: [] };
      const w = workflow([httpDemoNode('h')], []);

      const started = await startWorkflowRun(
        w,
        deps(store, { executors: { ...fakeRegistry({}, recorder), http: httpExecutor } }),
      );
      expect(started.ok).toBe(true);
      await settle();

      const run = store.get(started.ok ? started.value.id : '')!;
      const node = run.nodes.find((n) => n.nodeId === 'h');
      expect(node?.status).toBe('succeeded');
    } finally {
      await api.stop();
    }
  });

  it('fails an http node referencing {{demo.baseUrl}} with a friendly message when the demo API is not running', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const w = workflow([httpDemoNode('h')], []);

    const started = await startWorkflowRun(
      w,
      deps(store, { executors: { ...fakeRegistry({}, recorder), http: httpExecutor } }),
    );
    expect(started.ok).toBe(true);
    await settle();

    const run = store.get(started.ok ? started.value.id : '')!;
    const node = run.nodes.find((n) => n.nodeId === 'h');
    expect(node?.status).toBe('failed');
    expect(node?.error).toBe('Demo API is not running — start it from the Demo API pill.');
  });
});

// --- Phase 97 Theme D: the gate node ------------------------------------------

function gateNode(id: string, timeoutMs?: number): WorkflowNode {
  return {
    id,
    label: id,
    x: 0,
    y: 0,
    kind: 'gate',
    config: { title: 'Ship it?', instructions: '', onTimeout: 'reject', ...(timeoutMs !== undefined ? { timeoutMs } : {}) },
  };
}

function gateRegistry(recorder: Recorder): ExecutorRegistry {
  return { ...fakeRegistry({}, recorder), gate: createGateExecutor() };
}

describe('gate node (Phase 97 Theme D)', () => {
  it('pauses the run: the node reaches waiting, and the run itself stays running', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const w = workflow([gateNode('g')], []);

    const started = await startWorkflowRun(w, deps(store, { executors: gateRegistry(recorder) }));
    expect(started.ok).toBe(true);
    await settle();

    const run = store.get(started.ok ? started.value.id : '')!;
    expect(run.status).toBe('running');
    expect(run.nodes.find((n) => n.nodeId === 'g')?.status).toBe('waiting');
  });

  it('approve settles succeeded on the approved port — an ordinary branch, never a failure — and runs only that branch', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const w = typedWorkflow(
      [gateNode('g'), delayNode('onApproved'), delayNode('onRejected')],
      [
        { id: 'e1', from: 'g', to: 'onApproved', fromPort: 'approved' },
        { id: 'e2', from: 'g', to: 'onRejected', fromPort: 'rejected' },
      ],
    );

    const started = await startWorkflowRun(w, deps(store, { executors: gateRegistry(recorder) }));
    const runId = started.ok ? started.value.id : '';
    await settle();

    const decided = await decideWorkflowGate(runId, 'g', 'approved', 'lgtm', 'panel', deps(store));
    expect(decided.ok).toBe(true);
    await settle();

    const run = store.get(runId)!;
    const byId = Object.fromEntries(run.nodes.map((n) => [n.nodeId, n]));
    expect(byId.g!.status).toBe('succeeded');
    expect(byId.g!.settledPort).toBe('approved');
    expect(byId.g!.output).toEqual({ decision: 'approved', note: 'lgtm', decidedBy: 'panel' });
    expect(byId.onApproved!.status).toBe('succeeded');
    expect(byId.onRejected!.status).toBe('skipped');
    expect(run.status).toBe('completed');
  });

  it('reject settles succeeded on the rejected port and runs only that branch', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const w = typedWorkflow(
      [gateNode('g'), delayNode('onApproved'), delayNode('onRejected')],
      [
        { id: 'e1', from: 'g', to: 'onApproved', fromPort: 'approved' },
        { id: 'e2', from: 'g', to: 'onRejected', fromPort: 'rejected' },
      ],
    );

    const started = await startWorkflowRun(w, deps(store, { executors: gateRegistry(recorder) }));
    const runId = started.ok ? started.value.id : '';
    await settle();

    const decided = await decideWorkflowGate(runId, 'g', 'rejected', undefined, 'panel', deps(store));
    expect(decided.ok).toBe(true);
    await settle();

    const run = store.get(runId)!;
    const byId = Object.fromEntries(run.nodes.map((n) => [n.nodeId, n]));
    expect(byId.g!.status).toBe('succeeded');
    expect(byId.g!.settledPort).toBe('rejected');
    expect(byId.g!.output).toEqual({ decision: 'rejected', note: null, decidedBy: 'panel' });
    expect(byId.onApproved!.status).toBe('skipped');
    expect(byId.onRejected!.status).toBe('succeeded');
  });

  it('auto-rejects at its own config.timeoutMs, well before the generic per-node deadline could ever fire', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const w = workflow([gateNode('g', 5)], []);

    const started = await startWorkflowRun(w, deps(store, { executors: gateRegistry(recorder) }));
    await settle();

    const run = store.get(started.ok ? started.value.id : '')!;
    const node = run.nodes.find((n) => n.nodeId === 'g')!;
    // Succeeded, not the generic `timeout` status — a gate's own timeout is
    // an ordinary rejected branch, never a run-failing category.
    expect(node.status).toBe('succeeded');
    expect(node.settledPort).toBe('rejected');
    expect(node.output).toEqual({ decision: 'rejected', note: 'Timed out.', decidedBy: 'timeout' });
    expect(run.status).toBe('completed');
  });

  it('decideWorkflowGate refuses a decision for a node that is not (or no longer) waiting', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const w = workflow([gateNode('g')], []);
    const started = await startWorkflowRun(w, deps(store, { executors: gateRegistry(recorder) }));
    const runId = started.ok ? started.value.id : '';
    await settle();

    const first = await decideWorkflowGate(runId, 'g', 'approved', undefined, 'panel', deps(store));
    expect(first.ok).toBe(true);
    await settle();

    // Decided once already — a second decide (a race between two channels)
    // is refused, not silently re-applied.
    const second = await decideWorkflowGate(runId, 'g', 'rejected', undefined, 'mcp', deps(store));
    expect(second.ok).toBe(false);

    // A node id that was never a gate at all.
    const bogus = await decideWorkflowGate(runId, 'nope', 'approved', undefined, 'panel', deps(store));
    expect(bogus.ok).toBe(false);
  });

  it('cancelling a run with a waiting gate settles it failed with "Cancelled." and the run itself as cancelled', async () => {
    const store = makeStore();
    const recorder: Recorder = { started: [], settled: [] };
    const w = workflow([gateNode('g')], []);

    const started = await startWorkflowRun(w, deps(store, { executors: gateRegistry(recorder) }));
    const runId = started.ok ? started.value.id : '';
    await settle();
    expect(store.get(runId)!.nodes.find((n) => n.nodeId === 'g')?.status).toBe('waiting');

    const cancelled = await cancelWorkflowRun(runId, deps(store));
    expect(cancelled.ok).toBe(true);

    const run = store.get(runId)!;
    expect(run.status).toBe('cancelled');
    const node = run.nodes.find((n) => n.nodeId === 'g')!;
    expect(node.status).toBe('failed');
    expect(node.error).toBe('Cancelled.');

    // Nothing left waiting on this gate — a decide arriving after the fact
    // (a slow PR-comment poll tick, say) is a clean no-op, not a crash.
    const lateDecide = await decideWorkflowGate(runId, 'g', 'approved', undefined, 'pr-comment', deps(store));
    expect(lateDecide.ok).toBe(false);
  });
});
