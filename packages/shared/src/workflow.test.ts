import { describe, expect, it } from 'vitest';

import {
  WORKFLOW_MAX_NODE_TIMEOUT_MS,
  WORKFLOW_NODE_KINDS,
  WorkflowNodeSchema,
  WorkflowRunSchema,
  WorkflowSchema,
  ancestorIds,
  findCycleEdge,
  validateWorkflow,
  wouldCycle,
  type Workflow,
  type WorkflowEdge,
  type WorkflowNode,
} from './workflow';

function node(over: Partial<Extract<WorkflowNode, { kind: 'http' }>> = {}): WorkflowNode {
  return {
    id: 'a',
    label: 'Fetch',
    x: 0,
    y: 0,
    kind: 'http',
    config: { method: 'GET', url: 'http://127.0.0.1/items', headers: {}, params: {}, queryShaped: false },
    ...over,
  };
}

function workflow(over: Partial<Workflow> = {}): Workflow {
  return {
    id: 'w1',
    name: 'Two steps',
    nodes: [node(), node({ id: 'b', label: 'Create', config: { method: 'POST', url: 'http://127.0.0.1/items', headers: {}, params: {}, body: '{}', queryShaped: false } })],
    edges: [{ id: 'e1', from: 'a', to: 'b' }],
    createdAt: 1,
    updatedAt: 2,
    ...over,
  };
}

describe('WorkflowSchema', () => {
  it('round-trips a two-node workflow through JSON unchanged', () => {
    const w = workflow();
    expect(WorkflowSchema.parse(JSON.parse(JSON.stringify(w)))).toEqual(w);
  });

  it('discriminates node kinds on `kind`, and rejects one that is not in the vocabulary', () => {
    expect(WorkflowNodeSchema.safeParse({ ...node(), kind: 'agent' }).success).toBe(false);
    // Every kind in the exported list is parseable — the list and the union
    // cannot drift apart without this failing.
    expect(WORKFLOW_NODE_KINDS).toEqual(['http', 'transform', 'condition', 'delay', 'note']);
  });

  it('keeps fractional node positions — the canvas snaps, the schema does not', () => {
    const parsed = WorkflowNodeSchema.parse({ ...node(), x: 12.5, y: -3.25 });
    expect([parsed.x, parsed.y]).toEqual([12.5, -3.25]);
  });

  it('bounds a delay at a minute', () => {
    const base = { id: 'd', label: 'Wait', x: 0, y: 0, kind: 'delay' as const };
    expect(WorkflowNodeSchema.safeParse({ ...base, config: { ms: 60_000 } }).success).toBe(true);
    expect(WorkflowNodeSchema.safeParse({ ...base, config: { ms: 60_001 } }).success).toBe(false);
  });

  it('has no QUERY method — it is a GET carrying params', () => {
    expect(
      WorkflowNodeSchema.safeParse({ ...node(), config: { method: 'QUERY', url: 'u' } }).success,
    ).toBe(false);
    const parsed = WorkflowNodeSchema.parse({
      ...node(),
      config: { method: 'GET', url: 'u', params: { q: 'x' }, queryShaped: true },
    });
    expect(parsed.kind === 'http' && parsed.config.queryShaped).toBe(true);
  });
});

describe('WorkflowRunSchema', () => {
  it('carries its own frozen node + edge snapshot', () => {
    const run = {
      id: 'r1',
      workflowId: 'w1',
      workflowName: 'Two steps',
      status: 'running' as const,
      nodes: [
        {
          nodeId: 'a',
          kind: 'http' as const,
          label: 'Fetch',
          status: 'pending' as const,
          truncated: false,
          gatedDownstream: false,
        },
      ],
      edges: [{ id: 'e1', from: 'a', to: 'b' }],
      startedAt: 5,
    };
    expect(WorkflowRunSchema.parse(JSON.parse(JSON.stringify(run)))).toEqual(run);
  });

  it('models a timeout as its own status, not as a failure', () => {
    expect(WorkflowRunSchema.shape.nodes.element.shape.status.options).toContain('timeout');
  });
});

describe('validateWorkflow', () => {
  it('passes a well-formed workflow', () => {
    expect(validateWorkflow(workflow())).toEqual([]);
  });

  it('names the node with an empty URL', () => {
    const issues = validateWorkflow(
      workflow({ nodes: [node({ config: { method: 'GET', url: '  ', headers: {}, params: {}, queryShaped: false } })], edges: [] }),
    );
    expect(issues).toEqual([{ message: '"Fetch" has no URL.', nodeId: 'a' }]);
  });

  it('names the edge that points at a node that no longer exists', () => {
    const issues = validateWorkflow(workflow({ edges: [{ id: 'e9', from: 'a', to: 'gone' }] }));
    expect(issues).toEqual([
      { message: 'An edge ends at a node that no longer exists.', edgeId: 'e9' },
    ]);
  });

  it('rejects a self-edge and a duplicate connection', () => {
    const issues = validateWorkflow(
      workflow({
        edges: [
          { id: 'e1', from: 'a', to: 'a' },
          { id: 'e2', from: 'a', to: 'b' },
          { id: 'e3', from: 'a', to: 'b' },
        ],
      }),
    );
    expect(issues.map((i) => i.edgeId)).toEqual(['e1', 'e3']);
  });

  it('refuses to connect a note — it is a label, not a step', () => {
    const issues = validateWorkflow(
      workflow({
        nodes: [node(), { id: 'n', label: 'Why', x: 0, y: 0, kind: 'note', config: { text: 'hi' } }],
        edges: [{ id: 'e1', from: 'a', to: 'n' }],
      }),
    );
    expect(issues).toEqual([
      { message: 'A note cannot be connected — it is a label, not a step.', edgeId: 'e1' },
    ]);
  });

  it('says so when a workflow is nothing but notes', () => {
    const issues = validateWorkflow(
      workflow({
        nodes: [{ id: 'n', label: 'Why', x: 0, y: 0, kind: 'note', config: { text: '' } }],
        edges: [],
      }),
    );
    expect(issues).toEqual([{ message: 'This workflow has nothing to run.' }]);
  });
});

describe('the http node timeout override', () => {
  function withTimeout(ms: number): unknown {
    return {
      ...node(),
      config: { method: 'GET', url: 'http://127.0.0.1/x', headers: {}, params: {}, queryShaped: false, timeoutMs: ms },
    };
  }

  it('is bounded, for the reason `delay.ms` is bounded', () => {
    expect(WorkflowNodeSchema.safeParse(withTimeout(WORKFLOW_MAX_NODE_TIMEOUT_MS)).success).toBe(true);
    // Unbounded, a mistyped `86400000` parks a run for a day — and while it
    // runs, deleting that workflow is refused as "still running".
    expect(WorkflowNodeSchema.safeParse(withTimeout(86_400_000)).success).toBe(false);
    expect(WorkflowNodeSchema.safeParse(withTimeout(0)).success).toBe(false);
  });
});

describe('findCycleEdge / wouldCycle', () => {
  const edge = (id: string, from: string, to: string): WorkflowEdge => ({ id, from, to });

  it('returns null for a diamond, which is not a cycle', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'a', 'c'), edge('e3', 'b', 'd'), edge('e4', 'c', 'd')];
    expect(findCycleEdge(ids, edges)).toBeNull();
  });

  it('names an edge among the stuck remainder for a real cycle', () => {
    const ids = ['a', 'b', 'c'];
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'c'), edge('e3', 'c', 'a')];
    const cycle = findCycleEdge(ids, edges);
    expect(cycle).not.toBeNull();
    expect(edges).toContainEqual(cycle);
  });

  it('ignores a dangling edge endpoint rather than treating it as a cycle', () => {
    const ids = ['a', 'b'];
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'ghost')];
    expect(findCycleEdge(ids, edges)).toBeNull();
  });

  it('wouldCycle checks a candidate edge without mutating the existing set', () => {
    const ids = ['a', 'b', 'c'];
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')];
    expect(wouldCycle(edges, ids, { from: 'c', to: 'a' })).toBe(true);
    expect(wouldCycle(edges, ids, { from: 'a', to: 'c' })).toBe(false);
    expect(edges).toHaveLength(2);
  });
});

describe('ancestorIds', () => {
  const edge = (id: string, from: string, to: string): WorkflowEdge => ({ id, from, to });

  it('returns every transitive predecessor, not just direct parents', () => {
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')];
    expect(ancestorIds('c', edges)).toEqual(new Set(['a', 'b']));
  });

  it('returns an empty set for a node with no incoming edges', () => {
    const edges = [edge('e1', 'a', 'b')];
    expect(ancestorIds('a', edges)).toEqual(new Set());
  });

  it('merges branches of a diamond without duplicating the shared root', () => {
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'a', 'c'), edge('e3', 'b', 'd'), edge('e4', 'c', 'd')];
    expect(ancestorIds('d', edges)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('excludes the node itself even when it sits on a cycle', () => {
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')];
    expect(ancestorIds('a', edges)).toEqual(new Set(['b']));
  });
});
