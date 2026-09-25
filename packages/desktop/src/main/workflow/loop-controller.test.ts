import { describe, expect, it } from 'vitest';

import type { WorkflowEdge, WorkflowLoopState, WorkflowNode, WorkflowNodeRun, WorkflowRun } from '@midnite/studio-shared';

import {
  activeNodeRun,
  activeNodeRuns,
  buildLoopContext,
  evaluateLoopSettle,
  pushIterationRecords,
  upsertLoopState,
} from './loop-controller';

/**
 * `loop-controller.ts`'s own tests — no run lock, no store, no clock
 * ceremony, because every function here is pure (or, for the two mutators,
 * takes a plain object and mutates it in place). `workflow-engine.test.ts`
 * covers the same behavior wired through the real driver.
 */

const decideNode: WorkflowNode = {
  id: 'decide',
  label: 'Passed?',
  x: 0,
  y: 0,
  kind: 'condition',
  config: { left: '{{verify.passed}}', op: 'eq', right: 'true' },
};

const scriptSourceNode: WorkflowNode = { id: 'gen', label: 'Generate', x: 0, y: 0, kind: 'script', config: { command: 'echo', env: {} } };

function edges(): WorkflowEdge[] {
  return [
    { id: 'e1', from: 'build', to: 'verify' },
    { id: 'e2', from: 'verify', to: 'decide' },
    { id: 'e3', from: 'decide', to: 'done', fromPort: 'true' },
    {
      id: 'loop1',
      from: 'decide',
      to: 'build',
      fromPort: 'false',
      kind: 'loop',
      loop: { maxIterations: 3, budgetMs: 60_000 },
    },
  ];
}

function nodeRun(over: Partial<WorkflowNodeRun> = {}): WorkflowNodeRun {
  return {
    nodeId: 'decide',
    kind: 'condition',
    label: 'Passed?',
    status: 'succeeded',
    truncated: false,
    gatedDownstream: false,
    // `settledPort` is Theme B's own field — every fixture below sets it
    // explicitly, the same way `settleNode`'s `settledPortFor` would.
    settledPort: 'false',
    ...over,
  };
}

describe('evaluateLoopSettle', () => {
  it('is a no-op for a node that sources no loop edge', () => {
    const outcome = evaluateLoopSettle({
      node: { ...decideNode, id: 'other' },
      nodeRun: nodeRun({ nodeId: 'other' }),
      edges: edges(),
      loopStates: [],
      now: 0,
    });
    expect(outcome).toEqual({ action: 'none' });
  });

  it('is a no-op when settledPort does not match the loop edge\'s own port — B\'s cascade already routes everything else', () => {
    const outcome = evaluateLoopSettle({
      node: decideNode,
      nodeRun: nodeRun({ settledPort: 'true' }), // predicate passed
      edges: edges(),
      loopStates: [],
      now: 0,
    });
    expect(outcome).toEqual({ action: 'none' });
  });

  it('iterates when settledPort matches the loop edge and bounds allow it', () => {
    const outcome = evaluateLoopSettle({
      node: decideNode,
      nodeRun: nodeRun({ settledPort: 'false' }),
      edges: edges(),
      loopStates: [],
      now: 1_000,
    });
    expect(outcome.action).toBe('iterate');
    if (outcome.action !== 'iterate') throw new Error('unreachable');
    expect(outcome.nextIteration).toBe(2);
    expect(outcome.bodyNodeIds.sort()).toEqual(['build', 'decide', 'verify']);
    expect(outcome.loopState).toMatchObject({ edgeId: 'loop1', iteration: 2, startedAt: 1_000 });
  });

  it('stops with "max-iterations" once the next pass would exceed the bound, redirecting to the exhausted port', () => {
    const priorState: WorkflowLoopState = {
      edgeId: 'loop1',
      iteration: 3, // already at maxIterations
      startedAt: 0,
      seenKeyHashes: [],
      dryStreak: 0,
    };
    const outcome = evaluateLoopSettle({
      node: decideNode,
      nodeRun: nodeRun({ settledPort: 'false' }),
      edges: edges(),
      loopStates: [priorState],
      now: 500,
    });
    expect(outcome.action).toBe('stop');
    if (outcome.action !== 'stop') throw new Error('unreachable');
    expect(outcome.reason).toBe('max-iterations');
    expect(outcome.settledPortOverride).toBe('exhausted');
    expect(outcome.loopState.exitReason).toBe('max-iterations');
  });

  it('stops with "budget" once elapsed time reaches the bound', () => {
    const priorState: WorkflowLoopState = {
      edgeId: 'loop1',
      iteration: 1,
      startedAt: 0,
      seenKeyHashes: [],
      dryStreak: 0,
    };
    const outcome = evaluateLoopSettle({
      node: decideNode,
      nodeRun: nodeRun({ settledPort: 'false' }),
      edges: edges(),
      loopStates: [priorState],
      now: 60_000, // == budgetMs
    });
    expect(outcome.action).toBe('stop');
    if (outcome.action !== 'stop') throw new Error('unreachable');
    expect(outcome.reason).toBe('budget');
    expect(outcome.settledPortOverride).toBe('exhausted');
  });

  it('converges after enough dry rounds, and picks the single alternate out-port', () => {
    const edgesWithConvergence: WorkflowEdge[] = edges().map((e) =>
      e.id === 'loop1'
        ? {
            ...e,
            loop: { maxIterations: 20, budgetMs: 3_600_000, convergence: { kind: 'dry-rounds', rounds: 2, keyPath: 'idea.id' } },
          }
        : e,
    );

    // Round 1: fresh key, not yet dry.
    let states: WorkflowLoopState[] = [];
    let outcome = evaluateLoopSettle({
      node: decideNode,
      nodeRun: nodeRun({ settledPort: 'false', output: { idea: { id: 'x1' } } }),
      edges: edgesWithConvergence,
      loopStates: states,
      now: 0,
    });
    expect(outcome.action).toBe('iterate');
    if (outcome.action === 'iterate') states = [outcome.loopState];

    // Round 2: same rejected key again — dryStreak 1, still not converged.
    outcome = evaluateLoopSettle({
      node: decideNode,
      nodeRun: nodeRun({ settledPort: 'false', output: { idea: { id: 'x1' } } }),
      edges: edgesWithConvergence,
      loopStates: states,
      now: 0,
    });
    expect(outcome.action).toBe('iterate');
    if (outcome.action === 'iterate') states = [outcome.loopState];

    // Round 3: same key a third time — dryStreak reaches 2 (the configured `rounds`), converged.
    outcome = evaluateLoopSettle({
      node: decideNode,
      nodeRun: nodeRun({ settledPort: 'false', output: { idea: { id: 'x1' } } }),
      edges: edgesWithConvergence,
      loopStates: states,
      now: 0,
    });
    expect(outcome.action).toBe('stop');
    if (outcome.action !== 'stop') throw new Error('unreachable');
    expect(outcome.reason).toBe('converged');
    // decide's only non-loop, non-error out-port is `true`.
    expect(outcome.settledPortOverride).toBe('true');
  });

  it('falls back to the exhausted port on convergence when the source has no single alternate', () => {
    const loopOnlyEdges: WorkflowEdge[] = [
      {
        id: 'loop1',
        from: 'gen',
        to: 'gen',
        kind: 'loop',
        loop: { maxIterations: 20, budgetMs: 3_600_000, convergence: { kind: 'until-port', port: 'done' } },
      },
    ];
    const outcome = evaluateLoopSettle({
      node: scriptSourceNode,
      nodeRun: nodeRun({ nodeId: 'gen', kind: 'script', settledPort: 'out', output: { done: true } }),
      edges: loopOnlyEdges,
      loopStates: [],
      now: 0,
    });
    expect(outcome.action).toBe('stop');
    if (outcome.action !== 'stop') throw new Error('unreachable');
    expect(outcome.reason).toBe('converged');
    expect(outcome.settledPortOverride).toBe('exhausted');
  });
});

describe('activeNodeRun / activeNodeRuns', () => {
  function run(nodes: WorkflowNodeRun[]): WorkflowRun {
    return {
      id: 'r1',
      workflowId: 'w1',
      workflowName: 'W',
      status: 'running',
      nodes,
      edges: edges(),
      startedAt: 0,
    };
  }

  it('returns the single record for a node with no loop history', () => {
    const r = run([nodeRun({ nodeId: 'a' })]);
    expect(activeNodeRun(r, 'a')?.nodeId).toBe('a');
    expect(activeNodeRuns(r)).toHaveLength(1);
  });

  it('returns the highest-iteration record when a node has looped', () => {
    const r = run([
      nodeRun({ nodeId: 'build', iteration: 1, status: 'succeeded', output: { v: 1 } }),
      nodeRun({ nodeId: 'build', iteration: 2, status: 'pending', output: undefined }),
    ]);
    expect(activeNodeRun(r, 'build')?.iteration).toBe(2);
    expect(activeNodeRun(r, 'build')?.status).toBe('pending');
    expect(activeNodeRuns(r)).toHaveLength(1);
  });
});

describe('pushIterationRecords', () => {
  it('appends a fresh pending record per body node, copying kind/label, without touching history', () => {
    const r: WorkflowRun = {
      id: 'r1',
      workflowId: 'w1',
      workflowName: 'W',
      status: 'running',
      nodes: [
        nodeRun({ nodeId: 'build', kind: 'delay', label: 'Build', status: 'succeeded' }),
        nodeRun({ nodeId: 'verify', kind: 'delay', label: 'Verify', status: 'succeeded' }),
      ],
      edges: edges(),
      startedAt: 0,
    };
    pushIterationRecords(r, ['build', 'verify'], 2);
    expect(r.nodes).toHaveLength(4);
    const build2 = r.nodes.find((n) => n.nodeId === 'build' && n.iteration === 2);
    expect(build2).toMatchObject({ kind: 'delay', label: 'Build', status: 'pending' });
    // History untouched.
    expect(r.nodes.find((n) => n.nodeId === 'build' && n.iteration === undefined)?.status).toBe('succeeded');
  });
});

describe('upsertLoopState', () => {
  it('replaces only the matching edge id, leaving other loops alone', () => {
    const r: WorkflowRun = {
      id: 'r1',
      workflowId: 'w1',
      workflowName: 'W',
      status: 'running',
      nodes: [],
      edges: [],
      startedAt: 0,
      loopStates: [{ edgeId: 'loop1', iteration: 1, startedAt: 0, seenKeyHashes: [], dryStreak: 0 }],
    };
    upsertLoopState(r, { edgeId: 'loop2', iteration: 1, startedAt: 0, seenKeyHashes: [], dryStreak: 0 });
    expect(r.loopStates).toHaveLength(2);
    upsertLoopState(r, { edgeId: 'loop1', iteration: 2, startedAt: 0, seenKeyHashes: [], dryStreak: 0 });
    expect(r.loopStates).toHaveLength(2);
    expect(r.loopStates!.find((s) => s.edgeId === 'loop1')?.iteration).toBe(2);
  });
});

describe('buildLoopContext', () => {
  function runWithHistory(): WorkflowRun {
    return {
      id: 'r1',
      workflowId: 'w1',
      workflowName: 'W',
      status: 'running',
      nodes: [
        nodeRun({ nodeId: 'build', status: 'succeeded', output: { ok: true } }),
        nodeRun({ nodeId: 'verify', status: 'succeeded', output: { passed: false } }),
        nodeRun({ nodeId: 'decide', status: 'succeeded', gatedDownstream: true, output: { passed: false }, loopExit: undefined }),
        // Iteration 2, currently pending.
        nodeRun({ nodeId: 'build', iteration: 2, status: 'pending', output: undefined }),
      ],
      edges: edges(),
      startedAt: 0,
      loopStates: [{ edgeId: 'loop1', iteration: 2, startedAt: 0, seenKeyHashes: [], dryStreak: 0 }],
    };
  }

  it('is null for a node outside any active loop body', () => {
    expect(buildLoopContext(runWithHistory(), 'done', edges())).toBeNull();
  });

  it('carries iteration, previous outputs, and no failures when nothing failed', () => {
    const ctx = buildLoopContext(runWithHistory(), 'build', edges());
    expect(ctx).not.toBeNull();
    expect(ctx!.iteration).toBe(2);
    expect((ctx!.previous as Record<string, unknown>).verify).toEqual({ passed: false });
  });

  it('collects a redacted failure list from earlier iterations', () => {
    const r = runWithHistory();
    // Mark the decide node's iteration-1 record as having caused a loop stop.
    const decideRecord = r.nodes.find((n) => n.nodeId === 'decide')!;
    decideRecord.error = 'verify said no (token ghp_abcdefghijklmnopqrstuvwx1234)';
    decideRecord.loopExit = 'max-iterations';
    const ctx = buildLoopContext(r, 'build', edges());
    const failures = ctx!.failures as Array<{ iteration: number; nodeId: string; message: string }>;
    expect(failures).toHaveLength(1);
    expect(failures[0]!.nodeId).toBe('decide');
    expect(failures[0]!.message).not.toContain('ghp_abcdefghijklmnopqrstuvwx1234');
    expect(failures[0]!.message).toContain('<redacted>');
  });
});
