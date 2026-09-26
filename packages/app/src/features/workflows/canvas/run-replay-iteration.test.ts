import type { WorkflowNodeRun, WorkflowRun } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { nodeRunGroups, nodeStatusesAtIteration, nodesForIteration, runIterations, totalIterations } from './run-replay-iteration';

function nodeRun(overrides: Partial<WorkflowNodeRun> & Pick<WorkflowNodeRun, 'nodeId'>): WorkflowNodeRun {
  return {
    kind: 'agent',
    label: overrides.nodeId,
    status: 'succeeded',
    truncated: false,
    gatedDownstream: false,
    ...overrides,
  };
}

/**
 * `a` (before the loop) → `b`/`c` (the loop body, three passes) → `d` (after
 * the loop exhausts) — exactly the built-in templates' own shape
 * (Theme L's `harness-bounded-build`).
 */
function run(): WorkflowRun {
  return {
    id: 'r1',
    workflowId: 'w1',
    workflowName: 'W',
    status: 'completed',
    startedAt: 0,
    endedAt: 800,
    edges: [],
    nodes: [
      nodeRun({ nodeId: 'a', startedAt: 0, endedAt: 100 }),
      nodeRun({ nodeId: 'b', startedAt: 100, endedAt: 200, iteration: 1 }),
      nodeRun({ nodeId: 'c', startedAt: 200, endedAt: 300, iteration: 1 }),
      nodeRun({ nodeId: 'b', startedAt: 300, endedAt: 400, iteration: 2 }),
      nodeRun({ nodeId: 'c', startedAt: 400, endedAt: 500, iteration: 2 }),
      nodeRun({ nodeId: 'b', startedAt: 500, endedAt: 600, iteration: 3 }),
      nodeRun({ nodeId: 'c', startedAt: 600, endedAt: 700, iteration: 3 }),
      nodeRun({ nodeId: 'd', startedAt: 700, endedAt: 800 }),
    ],
  };
}

describe('runIterations / totalIterations', () => {
  it('collects every distinct iteration the run touched, ascending', () => {
    expect(runIterations(run())).toEqual([1, 2, 3]);
  });

  it('reads [1] / 1 for a run with no loop at all', () => {
    const flat = run();
    flat.nodes = flat.nodes.filter((n) => n.nodeId === 'a');
    expect(runIterations(flat)).toEqual([1]);
    expect(totalIterations(flat)).toBe(1);
  });

  it('totalIterations is how many passes actually ran, not a configured cap', () => {
    expect(totalIterations(run())).toBe(3);
  });
});

describe('nodesForIteration', () => {
  it('returns only that pass\'s own records, ordered by settledAt', () => {
    expect(nodesForIteration(run(), 2).map((n) => n.nodeId)).toEqual(['b', 'c']);
  });

  it('returns nothing for an iteration the run never reached', () => {
    expect(nodesForIteration(run(), 4)).toEqual([]);
  });
});

describe('nodeStatusesAtIteration', () => {
  it('pass 1: pre-loop node reached, loop body shows pass 1, post-loop node not reached yet', () => {
    const { statuses } = nodeStatusesAtIteration(run(), 1);
    expect(statuses.get('a')).toBe('succeeded');
    expect(statuses.get('b')).toBe('succeeded');
    expect(statuses.get('c')).toBe('succeeded');
    expect(statuses.get('d')).toBe('pending');
  });

  it('pass 3 (the last one that ran): the post-loop node STILL reads pending — it runs only after the loop as a whole exhausts, not during any one pass', () => {
    const { statuses } = nodeStatusesAtIteration(run(), 3);
    expect(statuses.get('a')).toBe('succeeded');
    expect(statuses.get('b')).toBe('succeeded');
    expect(statuses.get('c')).toBe('succeeded');
    expect(statuses.get('d')).toBe('pending');
  });

  it('carries settledPort/error for the pass\'s own record', () => {
    const withPort: WorkflowRun = {
      ...run(),
      nodes: run().nodes.map((n) => (n.nodeId === 'b' && n.iteration === 2 ? { ...n, settledPort: 'out' } : n)),
    };
    const { settledPorts } = nodeStatusesAtIteration(withPort, 2);
    expect(settledPorts.get('b')).toBe('out');
  });
});

describe('nodeRunGroups', () => {
  it('groups by node id in first-appearance order, each group\'s own runs ordered by iteration', () => {
    const groups = nodeRunGroups(run());
    expect(groups.map((g) => g.nodeId)).toEqual(['a', 'b', 'c', 'd']);
    const b = groups.find((g) => g.nodeId === 'b');
    expect(b?.runs.map((r) => r.iteration)).toEqual([1, 2, 3]);
  });

  it('a node outside any loop is its own one-entry group', () => {
    const groups = nodeRunGroups(run());
    const a = groups.find((g) => g.nodeId === 'a');
    expect(a?.runs).toHaveLength(1);
  });
});
