import { describe, expect, it } from 'vitest';

import type { WorkflowNode } from '@midnite/studio-shared';

import type { ExecutorContext } from '../executor-registry';
import { assertExecutor, failExecutor } from './guards';

function context(upstream: Record<string, unknown> = {}): ExecutorContext {
  return {
    upstream,
    signal: { cancelled: () => false },
    timeoutMs: 5_000,
    workflowId: 'w',
    runId: 'r',
    reportSessionId: async () => {},
    reportWaiting: async () => {},
  };
}

function assertNode(config: Partial<Extract<WorkflowNode, { kind: 'assert' }>['config']>): WorkflowNode {
  return { id: 'check', label: 'Check', x: 0, y: 0, kind: 'assert', config: { left: '', op: 'eq', right: '', message: '', ...config } };
}

describe('the assert executor', () => {
  it('passes through when the comparison holds', async () => {
    expect(await assertExecutor(assertNode({ left: '{{a.status}}', op: 'eq', right: '200' }), context({ a: { status: 200 } }))).toEqual({
      ok: true,
      output: { passed: true, left: '200', op: 'eq', right: '200' },
    });
  });

  it('fails with a generated sentence when it does not', async () => {
    expect(await assertExecutor(assertNode({ left: '3', op: 'gte', right: '5' }), context())).toEqual({
      ok: false,
      error: 'Assertion failed: expected "3" to be at least "5".',
    });
    expect(await assertExecutor(assertNode({ left: 'x', op: 'empty', right: undefined }), context())).toEqual({
      ok: false,
      error: 'Assertion failed: expected "x" to be empty.',
    });
  });

  it('fails with its own interpolated message when one is set', async () => {
    const outcome = await assertExecutor(
      assertNode({ left: '{{a.n}}', op: 'gt', right: '0', message: 'Got {{a.n}} rows' }),
      context({ a: { n: 0 } }),
    );
    expect(outcome).toEqual({ ok: false, error: 'Got 0 rows' });
  });

  it('reports an unresolved reference as the failure, not a false comparison', async () => {
    const outcome = await assertExecutor(assertNode({ left: '{{gone.x}}', op: 'eq', right: '1' }), context());
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.error).toContain('gone');
  });
});

describe('the fail executor', () => {
  it('always fails — with its message, interpolated', async () => {
    const node: WorkflowNode = { id: 'f', label: 'Stop', x: 0, y: 0, kind: 'fail', config: { message: 'Rejected by {{g.decidedBy}}' } };
    expect(await failExecutor(node, context({ g: { decidedBy: 'panel' } }))).toEqual({ ok: false, error: 'Rejected by panel' });
  });

  it('names the step when there is no message', async () => {
    const node: WorkflowNode = { id: 'f', label: 'Dead end', x: 0, y: 0, kind: 'fail', config: { message: '' } };
    expect(await failExecutor(node, context())).toEqual({ ok: false, error: 'Stopped at "Dead end".' });
  });
});
