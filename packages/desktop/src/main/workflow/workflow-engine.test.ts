import { beforeEach, describe, expect, it } from 'vitest';

import type { Workflow, WorkflowNode, WorkflowRun } from '@midnite/studio-shared';

import type { ExecutorRegistry, NodeExecutor, NodeOutcome } from './executor-registry';
import {
  cancelWorkflowRun,
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
          { gate: async () => ({ ok: true, output: { passed: false }, skipDownstream: true }) },
          recorder,
        ),
      }),
    );
    await settle();

    const run = store.get(started.ok ? started.value.id : '')!;
    const gate = run.nodes.find((n) => n.nodeId === 'gate')!;
    const after = run.nodes.find((n) => n.nodeId === 'after')!;
    expect(gate.status).toBe('succeeded');
    expect(gate.gatedDownstream).toBe(true);
    expect(after.status).toBe('skipped');
    expect(after.error).toContain('condition');
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
