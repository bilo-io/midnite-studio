import { describe, expect, it } from 'vitest';

import { buildWorkflowRunReceipt } from './workflow-receipt';
import type { WorkflowNode, WorkflowNodeRun, WorkflowRun } from './workflow';

function nodeRun(overrides: Partial<WorkflowNodeRun> & Pick<WorkflowNodeRun, 'nodeId' | 'kind'>): WorkflowNodeRun {
  return {
    label: overrides.nodeId,
    status: 'succeeded',
    truncated: false,
    gatedDownstream: false,
    ...overrides,
  };
}

/**
 * A fixture shaped like Phase 97 Theme L's own `harness-bounded-build`
 * template: trigger → policy → build (looped twice, retried on a failing
 * verify) → human gate → ship. Exercises every field the phase doc's own
 * receipt checklist names.
 */
const run: WorkflowRun = {
  id: 'run-1',
  workflowId: 'wf-1',
  workflowName: 'Bounded build',
  status: 'completed',
  startedAt: 1000,
  endedAt: 5000,
  edges: [],
  loopStates: [{ edgeId: 'loop-edge-1', iteration: 2, startedAt: 1500, seenKeyHashes: [], dryStreak: 0, exitReason: 'converged' }],
  nodes: [
    nodeRun({ nodeId: 'trigger', kind: 'trigger', label: 'Trigger', output: { number: 1 }, startedAt: 1000, endedAt: 1010, settledPort: 'out' }),
    nodeRun({
      nodeId: 'policy1',
      kind: 'policy',
      label: 'Policy',
      output: { allow: ['network'], requireApprovalFor: [] },
      startedAt: 1010,
      endedAt: 1020,
      settledPort: 'out',
    }),
    nodeRun({ nodeId: 'build', kind: 'agent', label: 'Build', output: 'ok-1', startedAt: 1020, endedAt: 1500, iteration: 1, settledPort: 'out' }),
    nodeRun({
      nodeId: 'verify',
      kind: 'verify',
      label: 'Verify',
      output: { check: 'test-counts', passed: 1, failed: 2, message: '2 failing', failures: ['a', 'b'] },
      startedAt: 1500,
      endedAt: 1800,
      iteration: 1,
      settledPort: 'fail',
    }),
    nodeRun({ nodeId: 'build', kind: 'agent', label: 'Build', output: 'ok-2', startedAt: 1800, endedAt: 2200, iteration: 2, settledPort: 'out' }),
    nodeRun({
      nodeId: 'verify',
      kind: 'verify',
      label: 'Verify',
      output: { check: 'test-counts', passed: 3, failed: 0, message: 'all good', failures: [] },
      startedAt: 2200,
      endedAt: 2500,
      iteration: 2,
      settledPort: 'pass',
    }),
    nodeRun({
      nodeId: 'gate',
      kind: 'gate',
      label: 'Human gate',
      output: { decision: 'approved', note: 'lgtm', decidedBy: 'panel' },
      startedAt: 2500,
      endedAt: 3000,
      settledPort: 'approved',
    }),
    nodeRun({ nodeId: 'ship', kind: 'agent', label: 'Ship', output: { url: 'https://example.com' }, startedAt: 3000, endedAt: 3500, settledPort: 'out' }),
  ],
};

const workflowNodes: WorkflowNode[] = [
  { id: 'trigger', label: 'Trigger', x: 0, y: 0, kind: 'trigger', config: { on: 'manual' } },
  { id: 'policy1', label: 'Policy', x: 0, y: 0, kind: 'policy', config: { allow: ['network'], requireApprovalFor: [] } },
  { id: 'build', label: 'Build', x: 0, y: 0, kind: 'agent', frameId: 'frame1', config: { agentId: 'claude', prompt: 'build it' } },
  {
    id: 'verify',
    label: 'Verify',
    x: 0,
    y: 0,
    kind: 'verify',
    config: { check: 'test-counts', command: 'pnpm test', env: {}, parser: 'vitest', minPassed: 1 },
  },
  { id: 'gate', label: 'Human gate', x: 0, y: 0, kind: 'gate', config: { title: 'Ship it?', instructions: 'Check the diff.', onTimeout: 'reject' } },
  { id: 'ship', label: 'Ship', x: 0, y: 0, kind: 'agent', config: { agentId: 'claude-ship', prompt: 'ship it' } },
  {
    id: 'frame1',
    label: 'Harness',
    x: 0,
    y: 0,
    kind: 'frame',
    config: { contract: '', context: '', state: '', tools: '', permissions: '', evidence: '', width: 640, height: 320 },
  },
];

describe('buildWorkflowRunReceipt', () => {
  it('has no cost field (Phase 94 Decision 8)', () => {
    const receipt = buildWorkflowRunReceipt(run);
    expect(receipt).not.toHaveProperty('cost');
    expect(receipt).not.toHaveProperty('costUsd');
    expect(receipt).not.toHaveProperty('tokens');
  });

  it('reads the trigger node output as the trigger payload', () => {
    expect(buildWorkflowRunReceipt(run).contextSources.triggerPayload).toEqual({ number: 1 });
  });

  it('reads null trigger payload for a run with no trigger node', () => {
    const noTrigger: WorkflowRun = { ...run, nodes: run.nodes.filter((n) => n.kind !== 'trigger') };
    expect(buildWorkflowRunReceipt(noTrigger).contextSources.triggerPayload).toBeNull();
  });

  it('lists distinct node kinds in first-appearance order', () => {
    expect(buildWorkflowRunReceipt(run).nodeKinds).toEqual(['trigger', 'policy', 'agent', 'verify', 'gate']);
  });

  it('hashes the policy outputs into a non-empty, order-stable policyVersion', () => {
    const a = buildWorkflowRunReceipt(run).policyVersion;
    const b = buildWorkflowRunReceipt(run).policyVersion;
    expect(a).not.toBe('');
    expect(a).toBe(b);
  });

  it('reads an empty policyVersion for a run with no policy node', () => {
    const noPolicy: WorkflowRun = { ...run, nodes: run.nodes.filter((n) => n.kind !== 'policy') };
    expect(buildWorkflowRunReceipt(noPolicy).policyVersion).toBe('');
  });

  it('changes policyVersion when the policy output actually differs', () => {
    const stricter: WorkflowRun = {
      ...run,
      nodes: run.nodes.map((n) => (n.nodeId === 'policy1' ? { ...n, output: { allow: [], requireApprovalFor: [] } } : n)),
    };
    expect(buildWorkflowRunReceipt(stricter).policyVersion).not.toBe(buildWorkflowRunReceipt(run).policyVersion);
  });

  it('collects verifier verdicts across every iteration, not just the last', () => {
    const verdicts = buildWorkflowRunReceipt(run).verifierVerdicts;
    expect(verdicts).toEqual([
      { nodeId: 'verify', label: 'Verify', check: 'test-counts', passed: 1, failed: 2, message: '2 failing' },
      { nodeId: 'verify', label: 'Verify', check: 'test-counts', passed: 3, failed: 0, message: 'all good' },
    ]);
  });

  it('carries loopStates through as loopIterations, verbatim', () => {
    expect(buildWorkflowRunReceipt(run).loopIterations).toEqual([{ edgeId: 'loop-edge-1', iterations: 2, exitReason: 'converged' }]);
  });

  it('reads human decisions off every gate node\'s own output', () => {
    expect(buildWorkflowRunReceipt(run).humanDecisions).toEqual([
      { nodeId: 'gate', label: 'Human gate', decision: 'approved', decidedBy: 'panel', note: 'lgtm', at: 3000 },
    ]);
  });

  it('computes wallClockMs from startedAt/endedAt', () => {
    expect(buildWorkflowRunReceipt(run).wallClockMs).toBe(4000);
  });

  it('falls back to Date.now() for wallClockMs on a still-running run', () => {
    const inFlight: WorkflowRun = { ...run, status: 'running', endedAt: undefined };
    expect(buildWorkflowRunReceipt(inFlight).wallClockMs).toBeGreaterThanOrEqual(0);
  });

  it('accepts the LAST node to settle in real time, not by iteration first', () => {
    // "ship" settles at 3500 (iteration unset = 1), after verify's own
    // iteration-2 record at 2500 — a naive (iteration, settledAt) global sort
    // would put the iteration-2 verify last instead, which is wrong: ship
    // genuinely happened after it.
    expect(buildWorkflowRunReceipt(run).acceptedArtifact).toEqual({
      nodeId: 'ship',
      label: 'Ship',
      output: { url: 'https://example.com' },
    });
  });

  it('reads a null acceptedArtifact for a run with nothing settled yet', () => {
    const nothingSettled: WorkflowRun = { ...run, nodes: run.nodes.map((n) => ({ ...n, output: undefined })) };
    expect(buildWorkflowRunReceipt(nothingSettled).acceptedArtifact).toBeNull();
  });

  it('passes rollbackPoint straight through, defaulting to null', () => {
    expect(buildWorkflowRunReceipt(run).rollbackPoint).toBeNull();
    expect(buildWorkflowRunReceipt(run, undefined, { rollbackPoint: 'abc123' }).rollbackPoint).toBe('abc123');
  });

  describe('with workflowNodes supplied', () => {
    it('reads agentsUsed from agent node configs, in node order', () => {
      expect(buildWorkflowRunReceipt(run, workflowNodes).agentsUsed).toEqual(['claude', 'claude-ship']);
    });

    it('reads frameIds from a contained agent node\'s own frameId', () => {
      expect(buildWorkflowRunReceipt(run, workflowNodes).contextSources.frameIds).toEqual(['frame1']);
    });
  });

  describe('without workflowNodes', () => {
    it('reads agentsUsed and frameIds as empty', () => {
      const receipt = buildWorkflowRunReceipt(run);
      expect(receipt.agentsUsed).toEqual([]);
      expect(receipt.contextSources.frameIds).toEqual([]);
    });
  });
});
