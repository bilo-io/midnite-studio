import { describe, expect, it } from 'vitest';

import {
  WORKFLOW_AGENT_DONE_MARKER,
  WORKFLOW_AGENT_DONE_MARKER_PATTERN,
  WORKFLOW_ERROR_PORT_ID,
  WORKFLOW_MAX_NODE_TIMEOUT_MS,
  WORKFLOW_NODE_KINDS,
  WORKFLOW_RESERVED_INTERPOLATION_ROOTS,
  WorkflowNodeSchema,
  WorkflowRunSchema,
  WorkflowSchema,
  agentNodeDonePrompt,
  ancestorIds,
  canConnect,
  findCycleEdge,
  migrateWorkflowEdges,
  normalizeEdge,
  portsForNode,
  validateWorkflow,
  wouldCycle,
  type Workflow,
  type WorkflowEdge,
  type WorkflowNode,
  type WorkflowPort,
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
    expect(WorkflowNodeSchema.safeParse({ ...node(), kind: 'shellexec' }).success).toBe(false);
    // Every kind in the exported list is parseable — the list and the union
    // cannot drift apart without this failing. `agent`/`script` (Theme J) and
    // `join` (Theme B) joined the MVP's original five.
    expect(WORKFLOW_NODE_KINDS).toEqual([
      'http',
      'transform',
      'condition',
      'delay',
      'note',
      'agent',
      'script',
      'join',
    ]);
  });

  it('keeps fractional node positions — the canvas snaps, the schema does not', () => {
    const parsed = WorkflowNodeSchema.parse({ ...node(), x: 12.5, y: -3.25 });
    expect([parsed.x, parsed.y]).toEqual([12.5, -3.25]);
  });

  it('parses an agent node and a script node (Theme J)', () => {
    const agentNode = WorkflowNodeSchema.parse({
      id: 'a',
      label: 'Ask',
      x: 0,
      y: 0,
      kind: 'agent',
      config: { agentId: 'claude', prompt: 'Do the thing' },
    });
    expect(agentNode.kind === 'agent' && agentNode.config.agentId).toBe('claude');

    const scriptNode = WorkflowNodeSchema.parse({
      id: 's',
      label: 'Run',
      x: 0,
      y: 0,
      kind: 'script',
      config: { command: 'echo hi', env: { FOO: 'bar' } },
    });
    expect(scriptNode.kind === 'script' && scriptNode.config.command).toBe('echo hi');
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

  it('names an agent node with no agent selected and one with no prompt (Theme J)', () => {
    const noAgent = validateWorkflow(
      workflow({
        nodes: [{ id: 'a', label: 'Ask', x: 0, y: 0, kind: 'agent', config: { agentId: '', prompt: 'Do it' } }],
        edges: [],
      }),
    );
    expect(noAgent).toEqual([{ message: '"Ask" has no agent selected.', nodeId: 'a' }]);

    const noPrompt = validateWorkflow(
      workflow({
        nodes: [{ id: 'a', label: 'Ask', x: 0, y: 0, kind: 'agent', config: { agentId: 'claude', prompt: '  ' } }],
        edges: [],
      }),
    );
    expect(noPrompt).toEqual([{ message: '"Ask" has no prompt.', nodeId: 'a' }]);
  });

  it('names a script node with no command (Theme J)', () => {
    const issues = validateWorkflow(
      workflow({
        nodes: [{ id: 'a', label: 'Run', x: 0, y: 0, kind: 'script', config: { command: '', env: {} } }],
        edges: [],
      }),
    );
    expect(issues).toEqual([{ message: '"Run" has no command.', nodeId: 'a' }]);
  });

  it('rejects a node id that collides with a reserved interpolation root (Theme M)', () => {
    for (const reserved of WORKFLOW_RESERVED_INTERPOLATION_ROOTS) {
      const issues = validateWorkflow(workflow({ nodes: [node({ id: reserved })], edges: [] }));
      expect(issues).toEqual([
        {
          message: `"Fetch" cannot use the reserved id "${reserved}" — {{${reserved}...}} is reserved for the engine.`,
          nodeId: reserved,
        },
      ]);
    }
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

  it('names an edge whose port no longer exists on either end (Theme A)', () => {
    const issues = validateWorkflow(
      workflow({ edges: [{ id: 'e1', from: 'a', to: 'b', fromPort: 'gone', toPort: 'also-gone' }] }),
    );
    expect(issues).toEqual([
      { message: '"Fetch" has no out-port named "gone".', edgeId: 'e1' },
      { message: '"Create" has no in-port named "also-gone".', edgeId: 'e1' },
    ]);
  });

  it('names a join with nothing wired to any of its in-N ports (Theme B)', () => {
    const issues = validateWorkflow(
      workflow({
        nodes: [node(), { id: 'j', label: 'Merge', x: 0, y: 0, kind: 'join', config: { mode: 'all', inputs: 2 } }],
        edges: [],
      }),
    );
    expect(issues).toContainEqual({ message: '"Merge" has nothing to join.', nodeId: 'j' });
  });

  it('does not double-report a note connection as a missing port', () => {
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
});

describe('portsForNode', () => {
  it('gives every plain executor-bearing kind an implicit multi-input `in` and an `error` out-port', () => {
    // `note` has no executor at all; `join` has no implicit `in` — its
    // in-ports are the config-driven `in-1..in-N` covered below — but both
    // still get the shared `error` out-port, checked separately.
    for (const kind of WORKFLOW_NODE_KINDS) {
      if (kind === 'note' || kind === 'join') continue;
      const n = { ...node(), kind } as WorkflowNode;
      const ports = portsForNode(n);
      expect(ports).toContainEqual(
        expect.objectContaining({ id: 'in', direction: 'in', type: 'any', allowMultiple: true }),
      );
      expect(ports.some((p) => p.id === WORKFLOW_ERROR_PORT_ID && p.direction === 'out')).toBe(true);
    }
  });

  it('gives a note no ports at all', () => {
    const n: WorkflowNode = { id: 'n', label: 'Why', x: 0, y: 0, kind: 'note', config: { text: '' } };
    expect(portsForNode(n)).toEqual([]);
  });

  it('settles a condition on named true/false out-ports, not a single out', () => {
    const n: WorkflowNode = {
      id: 'c',
      label: 'Check',
      x: 0,
      y: 0,
      kind: 'condition',
      config: { left: '{{a.status}}', op: 'eq', right: '200' },
    };
    const ports = portsForNode(n);
    expect(ports.filter((p) => p.direction === 'out').map((p) => p.id).sort()).toEqual(['error', 'false', 'true']);
  });

  it('copies an http/agent/script node\'s configured outputShape onto its `out` port', () => {
    const shape = { type: 'object' as const, properties: { id: { type: 'number' as const } } };
    const n: WorkflowNode = {
      ...node(),
      kind: 'http',
      config: { method: 'GET', url: 'u', headers: {}, params: {}, queryShaped: false, outputShape: shape },
    };
    const out = portsForNode(n).find((p) => p.id === 'out');
    expect(out?.outputShape).toEqual(shape);
  });

  it('gives a join distinct in-1..in-N ports, an `out` and an `error` (Theme B)', () => {
    const n: WorkflowNode = {
      id: 'j',
      label: 'Merge',
      x: 0,
      y: 0,
      kind: 'join',
      config: { mode: 'all', inputs: 3 },
    };
    const ports = portsForNode(n);
    expect(ports.filter((p) => p.direction === 'in').map((p) => p.id)).toEqual(['in-1', 'in-2', 'in-3']);
    // Distinct ids, no `allowMultiple` — `canConnect`'s existing "one edge
    // per in-port unless allowMultiple" already enforces one edge each.
    expect(ports.filter((p) => p.direction === 'in').every((p) => p.allowMultiple === undefined)).toBe(true);
    expect(ports.some((p) => p.id === 'out' && p.direction === 'out')).toBe(true);
    expect(ports.some((p) => p.id === WORKFLOW_ERROR_PORT_ID && p.direction === 'out')).toBe(true);
  });

  it('only an allSettled join pins a fulfilled/rejected outputShape on `out`', () => {
    const all: WorkflowNode = { id: 'j', label: 'Merge', x: 0, y: 0, kind: 'join', config: { mode: 'all', inputs: 2 } };
    const allSettled: WorkflowNode = {
      id: 'j',
      label: 'Merge',
      x: 0,
      y: 0,
      kind: 'join',
      config: { mode: 'allSettled', inputs: 2 },
    };
    expect(portsForNode(all).find((p) => p.id === 'out')?.outputShape).toBeUndefined();
    expect(portsForNode(allSettled).find((p) => p.id === 'out')?.outputShape).toEqual({
      type: 'object',
      properties: { fulfilled: { type: 'array', items: { type: 'any' } }, rejected: { type: 'array', items: { type: 'any' } } },
    });
  });
});

describe('normalizeEdge', () => {
  it('fills fromPort/toPort/kind defaults for a pre-Theme-A edge', () => {
    expect(normalizeEdge({ id: 'e1', from: 'a', to: 'b' })).toEqual({
      id: 'e1',
      from: 'a',
      to: 'b',
      fromPort: 'out',
      toPort: 'in',
      kind: 'data',
    });
  });

  it('leaves an already-typed edge untouched', () => {
    const edge: WorkflowEdge = { id: 'e1', from: 'a', to: 'b', fromPort: 'true', toPort: 'in', kind: 'conditional' };
    expect(normalizeEdge(edge)).toEqual(edge);
  });
});

describe('canConnect', () => {
  const httpNode: WorkflowNode = node();
  const conditionNode: WorkflowNode = {
    id: 'c',
    label: 'Check',
    x: 0,
    y: 0,
    kind: 'condition',
    config: { left: '{{a.status}}', op: 'eq', right: '200' },
  };
  const targetNode: WorkflowNode = { ...node(), id: 'b', label: 'Create' };

  const outPort = (p: Partial<WorkflowPort> = {}): WorkflowPort => ({
    id: 'out',
    label: 'Response',
    direction: 'out',
    type: 'json',
    ...p,
  });
  const inPort = (p: Partial<WorkflowPort> = {}): WorkflowPort => ({
    id: 'in',
    label: 'In',
    direction: 'in',
    type: 'any',
    allowMultiple: true,
    ...p,
  });

  it('allows a compatible connection', () => {
    expect(canConnect(httpNode, outPort(), targetNode, inPort(), [])).toEqual({ ok: true });
  });

  it('rejects the wrong direction on either end', () => {
    expect(canConnect(httpNode, inPort(), targetNode, inPort(), []).ok).toBe(false);
    expect(canConnect(httpNode, outPort(), targetNode, outPort(), []).ok).toBe(false);
  });

  it('rejects a self-connection', () => {
    expect(canConnect(httpNode, outPort(), httpNode, inPort(), []).ok).toBe(false);
  });

  it('rejects an incompatible port type', () => {
    const result = canConnect(httpNode, outPort({ type: 'text' }), targetNode, inPort({ type: 'number' }), []);
    expect(result).toEqual({ ok: false, reason: '"Response" (text) cannot connect to "In" (number).' });
  });

  it('any accepts everything, in either port', () => {
    expect(canConnect(httpNode, outPort({ type: 'any' }), targetNode, inPort({ type: 'number' }), []).ok).toBe(true);
    expect(canConnect(httpNode, outPort({ type: 'text' }), targetNode, inPort({ type: 'any' }), []).ok).toBe(true);
  });

  it('allows verdict -> boolean, but not boolean -> verdict', () => {
    expect(canConnect(httpNode, outPort({ type: 'verdict' }), targetNode, inPort({ type: 'boolean' }), []).ok).toBe(true);
    expect(canConnect(httpNode, outPort({ type: 'boolean' }), targetNode, inPort({ type: 'verdict' }), []).ok).toBe(false);
  });

  it('rejects mismatched shapes only when both sides declare one', () => {
    const objShape = { type: 'object' as const };
    const arrShape = { type: 'array' as const };
    expect(
      canConnect(httpNode, outPort({ outputShape: objShape }), targetNode, inPort({ outputShape: arrShape }), []).ok,
    ).toBe(false);
    // One side unpinned — permissive.
    expect(canConnect(httpNode, outPort({ outputShape: objShape }), targetNode, inPort(), []).ok).toBe(true);
  });

  it('rejects a second edge into a single-input port, allows it when allowMultiple', () => {
    const existing: WorkflowEdge = { id: 'e1', from: 'x', to: 'b', toPort: 'in' };
    const single = canConnect(httpNode, outPort(), targetNode, inPort({ allowMultiple: undefined }), [existing]);
    expect(single).toEqual({
      ok: false,
      reason: '"In" already has a connection — only a multi-input port accepts more than one.',
    });
    const multi = canConnect(httpNode, outPort(), targetNode, inPort({ allowMultiple: true }), [existing]);
    expect(multi.ok).toBe(true);
  });

  it('rejects a connection that would create a cycle', () => {
    // a -> b already exists; connecting b -> a would close the loop.
    const existing: WorkflowEdge[] = [{ id: 'e1', from: 'a', to: 'b' }];
    expect(canConnect(targetNode, outPort(), httpNode, inPort(), existing).ok).toBe(false);
  });

  it('lets a condition connect from its named true/false ports', () => {
    const truePort: WorkflowPort = { id: 'true', label: 'True', direction: 'out', type: 'any' };
    expect(canConnect(conditionNode, truePort, targetNode, inPort(), []).ok).toBe(true);
  });
});

describe('migrateWorkflowEdges', () => {
  it('is the identity — same reference — for a workflow with no legacy condition edge', () => {
    const w = workflow();
    expect(migrateWorkflowEdges(w)).toBe(w);
  });

  it('maps a legacy condition node\'s outgoing edge onto its `true` port', () => {
    const w = workflow({
      nodes: [
        { id: 'c', label: 'Check', x: 0, y: 0, kind: 'condition', config: { left: 'x', op: 'eq', right: '1' } },
        node({ id: 'b', label: 'Create' }),
      ],
      edges: [{ id: 'e1', from: 'c', to: 'b' }],
    });
    const migrated = migrateWorkflowEdges(w);
    expect(migrated).not.toBe(w);
    expect(migrated.edges).toEqual([{ id: 'e1', from: 'c', to: 'b', fromPort: 'true', kind: 'conditional' }]);
  });

  it('preserves the false-gates-everything-downstream semantics: only the true branch is a taken edge', () => {
    const w = workflow({
      nodes: [
        { id: 'c', label: 'Check', x: 0, y: 0, kind: 'condition', config: { left: 'x', op: 'eq', right: '1' } },
        node({ id: 'b', label: 'Create' }),
      ],
      edges: [{ id: 'e1', from: 'c', to: 'b' }],
    });
    const migrated = migrateWorkflowEdges(w);
    const normalized = normalizeEdge(migrated.edges[0]!);
    expect(normalized.fromPort).toBe('true');
  });

  it('leaves an edge with an explicit fromPort untouched, even from a condition node', () => {
    const w = workflow({
      nodes: [
        { id: 'c', label: 'Check', x: 0, y: 0, kind: 'condition', config: { left: 'x', op: 'eq', right: '1' } },
        node({ id: 'b', label: 'Create' }),
      ],
      edges: [{ id: 'e1', from: 'c', to: 'b', fromPort: 'false' }],
    });
    expect(migrateWorkflowEdges(w)).toBe(w);
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

describe('agentNodeDonePrompt / WORKFLOW_AGENT_DONE_MARKER_PATTERN (Theme J)', () => {
  it('appends the done-marker instruction to the node prompt, keeping the original text', () => {
    const built = agentNodeDonePrompt('Fix the failing test');
    expect(built).toContain('Fix the failing test');
    expect(built).toContain(WORKFLOW_AGENT_DONE_MARKER);
  });

  it('matches a bare marker, and captures ok/fail when present', () => {
    expect(WORKFLOW_AGENT_DONE_MARKER_PATTERN.exec('blah MIDNITE_WORKFLOW_NODE_DONE blah')?.[1]).toBeUndefined();
    expect(WORKFLOW_AGENT_DONE_MARKER_PATTERN.exec('MIDNITE_WORKFLOW_NODE_DONE: ok')?.[1]).toBe('ok');
    expect(WORKFLOW_AGENT_DONE_MARKER_PATTERN.exec('MIDNITE_WORKFLOW_NODE_DONE: fail')?.[1]).toBe('fail');
    expect(WORKFLOW_AGENT_DONE_MARKER_PATTERN.exec('nothing here')).toBeNull();
  });
});
