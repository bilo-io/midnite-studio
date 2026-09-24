import type { WorkflowNodeRun, WorkflowRun } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { nodeStatusesAtStep, replayOrder } from './run-replay';

function nodeRun(overrides: Partial<WorkflowNodeRun> & Pick<WorkflowNodeRun, 'nodeId'>): WorkflowNodeRun {
  return {
    kind: 'http',
    label: overrides.nodeId,
    status: 'succeeded',
    truncated: false,
    gatedDownstream: false,
    ...overrides,
  };
}

function run(nodes: WorkflowNodeRun[]): WorkflowRun {
  return {
    id: 'r1',
    workflowId: 'w1',
    workflowName: 'W',
    status: 'completed',
    nodes,
    edges: [],
    startedAt: 0,
  };
}

describe('replayOrder', () => {
  it('orders by startedAt', () => {
    const r = run([
      nodeRun({ nodeId: 'c', startedAt: 300 }),
      nodeRun({ nodeId: 'a', startedAt: 100 }),
      nodeRun({ nodeId: 'b', startedAt: 200 }),
    ]);
    expect(replayOrder(r).map((n) => n.nodeId)).toEqual(['a', 'b', 'c']);
  });

  it('falls back to endedAt for a node that never started (skipped)', () => {
    const r = run([
      nodeRun({ nodeId: 'started', startedAt: 100, status: 'succeeded' }),
      nodeRun({ nodeId: 'skipped', endedAt: 50, status: 'skipped' }),
    ]);
    // The skip settled (endedAt 50) before the other node even started (100).
    expect(replayOrder(r).map((n) => n.nodeId)).toEqual(['skipped', 'started']);
  });

  it('breaks a tie by nodeId, stably', () => {
    const r = run([nodeRun({ nodeId: 'z' }), nodeRun({ nodeId: 'a' })]);
    expect(replayOrder(r).map((n) => n.nodeId)).toEqual(['a', 'z']);
  });
});

describe('nodeStatusesAtStep', () => {
  const r = run([
    nodeRun({ nodeId: 'a', startedAt: 100, status: 'succeeded' }),
    nodeRun({ nodeId: 'b', startedAt: 200, status: 'failed', error: 'boom' }),
    nodeRun({ nodeId: 'c', startedAt: 300, status: 'succeeded' }),
  ]);

  it('step 0 — nothing has happened yet, every node reads pending', () => {
    const { statuses, errors } = nodeStatusesAtStep(r, 0);
    expect(statuses.get('a')).toBe('pending');
    expect(statuses.get('b')).toBe('pending');
    expect(statuses.get('c')).toBe('pending');
    expect(errors.size).toBe(0);
  });

  it('a partial step shows real status for settled nodes, pending for the rest', () => {
    const { statuses, errors } = nodeStatusesAtStep(r, 2);
    expect(statuses.get('a')).toBe('succeeded');
    expect(statuses.get('b')).toBe('failed');
    expect(statuses.get('c')).toBe('pending');
    expect(errors.get('b')).toBe('boom');
    expect(errors.has('c')).toBe(false);
  });

  it('the final step (node count) matches the run\'s own recorded statuses', () => {
    const { statuses } = nodeStatusesAtStep(r, 3);
    expect(statuses.get('a')).toBe('succeeded');
    expect(statuses.get('b')).toBe('failed');
    expect(statuses.get('c')).toBe('succeeded');
  });
});
