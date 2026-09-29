import { beforeEach, describe, expect, it } from 'vitest';

import type { Workflow, WorkflowEdge, WorkflowNode, WorkflowRun } from '@midnite/studio-shared';

import { defaultExecutors } from './executors';
import { resetGateWaitersForTests } from './gate-waiters';
import { runLocksSizeForTests, startWorkflowRun, type EngineDeps } from './workflow-engine';

/**
 * The palette kinds end to end through the real engine and the real
 * registry (`defaultExecutors`) — only the pure data/guard kinds, which
 * touch nothing outside the run. The point is the wiring the per-executor
 * tests cannot see: that each kind is bound in the registry, that `{{...}}`
 * reaches it from upstream, and that an `assert`/`fail` failure takes the
 * Phase 97 error edge like any other failure.
 */

function n(node: Omit<WorkflowNode, 'label' | 'x' | 'y'> & { label?: string }): WorkflowNode {
  return { label: node.id, x: 0, y: 0, ...node } as WorkflowNode;
}

function workflow(nodes: WorkflowNode[], edges: WorkflowEdge[]): Workflow {
  return { id: 'w1', name: 'Palette', nodes, edges, createdAt: 1, updatedAt: 1 };
}

function store() {
  const runs = new Map<string, WorkflowRun>();
  return {
    get: (id: string) => runs.get(id),
    saveRun: async (run: WorkflowRun) => void runs.set(run.id, structuredClone(run)),
    getRun: async (id: string) => {
      const run = runs.get(id);
      return run ? structuredClone(run) : null;
    },
  };
}

async function runToEnd(w: Workflow): Promise<WorkflowRun> {
  const s = store();
  const deps: EngineDeps = { saveRun: s.saveRun, getRun: s.getRun, emitChanged: () => {}, executors: defaultExecutors };
  const started = await startWorkflowRun(w, deps);
  if (!started.ok) throw new Error('did not start');
  for (let i = 0; i < 40; i += 1) await new Promise((resolve) => setTimeout(resolve, 1));
  return s.get(started.value.id)!;
}

beforeEach(() => {
  expect(runLocksSizeForTests()).toBe(0);
  resetGateWaitersForTests();
});

describe('palette kinds through the engine', () => {
  it('set-fields → json-extract → assert → coalesce completes, each reading the one before', async () => {
    const run = await runToEnd(
      workflow(
        [
          n({ id: 'seed', kind: 'set-fields', config: { fields: { raw: '{"items":[{"id":"a1"}]}', n: '3' } } }),
          n({ id: 'pick', kind: 'json-extract', config: { source: '{{seed.raw}}', path: 'items.0.id', required: true } }),
          n({ id: 'guard', kind: 'assert', config: { left: '{{pick.value}}', op: 'eq', right: 'a1', message: '' } }),
          n({ id: 'first', kind: 'coalesce', config: { candidates: ['{{nowhere.x}}', '{{seed.n}}'] } }),
        ],
        [
          { id: 'e1', from: 'seed', to: 'pick' },
          { id: 'e2', from: 'pick', to: 'guard' },
          { id: 'e3', from: 'guard', to: 'first' },
        ],
      ),
    );
    expect(run.status).toBe('completed');
    const byId = Object.fromEntries(run.nodes.map((node) => [node.nodeId, node]));
    expect(byId.pick!.output).toEqual({ value: 'a1', found: true });
    expect(byId.first!.output).toEqual({ value: 3, index: 1 });
  });

  it('a failed assert takes its error edge, and a fail node fails the run it ends', async () => {
    const run = await runToEnd(
      workflow(
        [
          n({ id: 'guard', kind: 'assert', config: { left: '2', op: 'gt', right: '5', message: 'too few' } }),
          n({ id: 'stop', kind: 'fail', config: { message: 'Guard said: {{guard.message}}' } }),
        ],
        [{ id: 'e1', from: 'guard', to: 'stop', fromPort: 'error', toPort: 'in', kind: 'error' }],
      ),
    );
    const byId = Object.fromEntries(run.nodes.map((node) => [node.nodeId, node]));
    expect(byId.guard!.status).toBe('failed');
    expect(byId.guard!.settledPort).toBe('error');
    expect(byId.stop!.status).toBe('failed');
    expect(byId.stop!.error).toBe('Guard said: too few');
    expect(run.status).toBe('failed');
  });
});
