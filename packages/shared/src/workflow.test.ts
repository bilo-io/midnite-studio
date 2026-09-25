import { describe, expect, it } from 'vitest';

import {
  WORKFLOW_AGENT_DONE_MARKER,
  WORKFLOW_AGENT_DONE_MARKER_PATTERN,
  WORKFLOW_ERROR_PORT_ID,
  WORKFLOW_LOOP_EXHAUSTED_PORT_ID,
  WORKFLOW_LOOP_MAX_ITERATIONS,
  WORKFLOW_MAX_NODE_TIMEOUT_MS,
  WORKFLOW_NODE_KINDS,
  WORKFLOW_RESERVED_INTERPOLATION_ROOTS,
  WORKFLOW_ROUTER_DEFAULT_PORT_ID,
  WorkflowEdgeSchema,
  WorkflowNodeSchema,
  WorkflowRunSchema,
  WorkflowSchema,
  agentNodeDonePrompt,
  ancestorIds,
  canConnect,
  canConnectLoop,
  findAcyclicEdgeViolation,
  findCycleEdge,
  formatLoopFailuresBlock,
  hashLoopKey,
  loopBodyNodeIds,
  migrateWorkflowEdges,
  nodeRunIteration,
  normalizeEdge,
  portsForNode,
  readLoopKeyPath,
  validateWorkflow,
  workflowIssueSeverity,
  workflowLoopStates,
  wouldCycle,
  type Workflow,
  type WorkflowEdge,
  type WorkflowNode,
  type WorkflowPort,
  type WorkflowVerifyConfig,
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

function verifyNode(over: Partial<Extract<WorkflowNode, { kind: 'verify' }>> & { config?: WorkflowVerifyConfig } = {}): WorkflowNode {
  return {
    id: 'v',
    label: 'Verify',
    x: 0,
    y: 0,
    kind: 'verify',
    config: { check: 'exit-code', command: 'exit 0', env: {} },
    ...over,
  } as WorkflowNode;
}

describe('WorkflowSchema', () => {
  it('round-trips a two-node workflow through JSON unchanged', () => {
    const w = workflow();
    expect(WorkflowSchema.parse(JSON.parse(JSON.stringify(w)))).toEqual(w);
  });

  it('discriminates node kinds on `kind`, and rejects one that is not in the vocabulary', () => {
    expect(WorkflowNodeSchema.safeParse({ ...node(), kind: 'shellexec' }).success).toBe(false);
    // Every kind in the exported list is parseable — the list and the union
    // cannot drift apart without this failing. `agent`/`script` (Theme J),
    // `join` (Theme B), `gate` (Theme D), `router` (Theme F), `verify`
    // (Theme E), `trigger` (Theme H), `state` (Theme G) and `frame`/`policy`
    // (Theme I) joined the MVP's original five.
    expect(WORKFLOW_NODE_KINDS).toEqual([
      'http',
      'transform',
      'condition',
      'delay',
      'note',
      'agent',
      'script',
      'join',
      'gate',
      'router',
      'verify',
      'trigger',
      'state',
      'frame',
      'policy',
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

  it('names a gate with no title (Theme D)', () => {
    const issues = validateWorkflow(
      workflow({
        nodes: [{ id: 'g', label: 'Gate', x: 0, y: 0, kind: 'gate', config: { title: '', instructions: '', onTimeout: 'reject' } }],
        edges: [],
      }),
    );
    expect(issues).toContainEqual({ message: '"Gate" has no title.', nodeId: 'g' });
  });

  it('names a router with no cases, a duplicate case id and a reserved case id (Theme F)', () => {
    const noCases = validateWorkflow(
      workflow({
        nodes: [{ id: 'r', label: 'Route', x: 0, y: 0, kind: 'router', config: { mode: 'expression', cases: [] } }],
        edges: [],
      }),
    );
    expect(noCases).toContainEqual({ message: '"Route" has no cases.', nodeId: 'r' });

    const duplicate = validateWorkflow(
      workflow({
        nodes: [
          {
            id: 'r',
            label: 'Route',
            x: 0,
            y: 0,
            kind: 'router',
            config: {
              mode: 'expression',
              cases: [
                { id: 'a', label: 'A', when: { left: 'x', op: 'eq', right: '1' } },
                { id: 'a', label: 'A again', when: { left: 'x', op: 'eq', right: '2' } },
              ],
            },
          },
        ],
        edges: [],
      }),
    );
    expect(duplicate).toContainEqual({ message: '"Route" has two cases with the id "a".', nodeId: 'r' });

    const reserved = validateWorkflow(
      workflow({
        nodes: [
          {
            id: 'r',
            label: 'Route',
            x: 0,
            y: 0,
            kind: 'router',
            config: {
              mode: 'expression',
              cases: [{ id: 'default', label: 'Default-ish', when: { left: 'x', op: 'eq', right: '1' } }],
            },
          },
        ],
        edges: [],
      }),
    );
    expect(reserved).toContainEqual({
      message: '"Route" case "Default-ish" cannot use the reserved id "default".',
      nodeId: 'r',
    });
  });

  it('names an expression-mode router case with no condition, and an agent-label router with no agent/prompt (Theme F)', () => {
    const noCondition = validateWorkflow(
      workflow({
        nodes: [
          {
            id: 'r',
            label: 'Route',
            x: 0,
            y: 0,
            kind: 'router',
            config: { mode: 'expression', cases: [{ id: 'a', label: 'A' }] },
          },
        ],
        edges: [],
      }),
    );
    expect(noCondition).toContainEqual({ message: '"Route" case "A" has no condition.', nodeId: 'r' });

    const noAgent = validateWorkflow(
      workflow({
        nodes: [
          {
            id: 'r',
            label: 'Route',
            x: 0,
            y: 0,
            kind: 'router',
            config: { mode: 'agent-label', cases: [{ id: 'a', label: 'A' }] },
          },
        ],
        edges: [],
      }),
    );
    expect(noAgent).toContainEqual({ message: '"Route" has no agent selected.', nodeId: 'r' });
    expect(noAgent).toContainEqual({ message: '"Route" has no prompt.', nodeId: 'r' });
  });

  it('flags every trigger node once a workflow has more than one (Theme H)', () => {
    const trigger = (id: string, label: string): WorkflowNode => ({
      id,
      label,
      x: 0,
      y: 0,
      kind: 'trigger',
      config: { on: 'manual' },
    });
    const one = validateWorkflow(workflow({ nodes: [trigger('t1', 'Start')], edges: [] }));
    expect(one).not.toContainEqual(expect.objectContaining({ nodeId: 't1' }));

    const two = validateWorkflow(
      workflow({ nodes: [trigger('t1', 'Start'), trigger('t2', 'Also start')], edges: [] }),
    );
    expect(two).toContainEqual({
      message: '"Start" — only one trigger node is allowed per workflow.',
      nodeId: 't1',
    });
    expect(two).toContainEqual({
      message: '"Also start" — only one trigger node is allowed per workflow.',
      nodeId: 't2',
    });
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

  it('names a verify node missing its check-specific fields (Theme E)', () => {
    const noAgent = validateWorkflow(
      workflow({ nodes: [verifyNode({ config: { check: 'agent', agentId: '', prompt: '' } })], edges: [] }),
    );
    expect(noAgent).toEqual([{ message: '"Verify" has no agent selected for its check.', nodeId: 'v' }]);

    const noCommand = validateWorkflow(
      workflow({ nodes: [verifyNode({ config: { check: 'exit-code', command: '  ', env: {} } })], edges: [] }),
    );
    expect(noCommand).toEqual([{ message: '"Verify" has no command.', nodeId: 'v' }]);

    const noTestCommand = validateWorkflow(
      workflow({
        nodes: [
          verifyNode({ config: { check: 'test-counts', command: '', env: {}, parser: 'vitest', minPassed: 1 } }),
        ],
        edges: [],
      }),
    );
    expect(noTestCommand).toEqual([{ message: '"Verify" has no command.', nodeId: 'v' }]);

    const noRight = validateWorkflow(
      workflow({
        nodes: [verifyNode({ config: { check: 'json-path', source: '{{a.status}}', op: 'eq' } })],
        edges: [],
      }),
    );
    expect(noRight).toEqual([
      { message: '"Verify" compares with "eq" but has no right-hand value.', nodeId: 'v' },
    ]);
  });

  it('warns (does not error) when a verify agent check shares its maker\'s agent id (Theme E)', () => {
    const maker: WorkflowNode = { id: 'm', label: 'Build', x: 0, y: 0, kind: 'agent', config: { agentId: 'claude', prompt: 'build it' } };
    const checker = verifyNode({ config: { check: 'agent', agentId: 'claude', prompt: 'check it' } });

    const issues = validateWorkflow(
      workflow({ nodes: [maker, checker], edges: [{ id: 'e1', from: 'm', to: 'v' }] }),
    );
    expect(issues).toEqual([
      {
        message:
          '"Verify" checks the same agent ("claude") that produced the work it is checking — a checker that is not the maker catches more.',
        nodeId: 'v',
        severity: 'warning',
      },
    ]);
    expect(issues.every((issue) => workflowIssueSeverity(issue) === 'warning')).toBe(true);
  });

  it('does not warn when a verify agent check uses a different agent than its maker (Theme E)', () => {
    const maker: WorkflowNode = { id: 'm', label: 'Build', x: 0, y: 0, kind: 'agent', config: { agentId: 'claude', prompt: 'build it' } };
    const checker = verifyNode({ config: { check: 'agent', agentId: 'codex', prompt: 'check it' } });

    const issues = validateWorkflow(
      workflow({ nodes: [maker, checker], edges: [{ id: 'e1', from: 'm', to: 'v' }] }),
    );
    expect(issues).toEqual([]);
  });
});

describe('workflowIssueSeverity', () => {
  it('reads an unset severity as the blocking default', () => {
    expect(workflowIssueSeverity({ severity: undefined })).toBe('error');
    expect(workflowIssueSeverity({ severity: 'warning' })).toBe('warning');
  });
});

describe('portsForNode', () => {
  it('gives every plain executor-bearing kind an implicit multi-input `in` and an `error` out-port', () => {
    // `note`/`frame` have no executor at all; `join`/`router` have
    // config-driven out-ports (`in-1..in-N`, one per declared case) rather
    // than the plain implicit shape this loop checks; `trigger` has no
    // in-port by design (Theme H — it is the graph's own start) — all five
    // covered on their own below instead, and this fixture's `config` is an
    // `http` node's shape reused across every kind, which their port
    // functions actually read.
    for (const kind of WORKFLOW_NODE_KINDS) {
      if (kind === 'note' || kind === 'join' || kind === 'router' || kind === 'trigger' || kind === 'frame') continue;
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

  it('gives a trigger an `out` and `error` port, but no `in` (Theme H)', () => {
    const n: WorkflowNode = { id: 't', label: 'Start', x: 0, y: 0, kind: 'trigger', config: { on: 'manual' } };
    const ports = portsForNode(n);
    expect(ports).toEqual([
      { id: 'out', label: 'Out', direction: 'out', type: 'any' },
      expect.objectContaining({ id: WORKFLOW_ERROR_PORT_ID, direction: 'out' }),
    ]);
    expect(ports.some((p) => p.direction === 'in')).toBe(false);
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

  it('settles a verify node on named pass/fail verdict out-ports, plus the standard error port (Theme E)', () => {
    const ports = portsForNode(verifyNode());
    const outPorts = ports.filter((p) => p.direction === 'out');
    expect(outPorts.map((p) => p.id).sort()).toEqual(['error', 'fail', 'pass']);
    expect(outPorts.find((p) => p.id === 'pass')).toMatchObject({ type: 'verdict' });
    expect(outPorts.find((p) => p.id === 'fail')).toMatchObject({ type: 'verdict' });
    expect(ports).toContainEqual(expect.objectContaining({ id: 'in', direction: 'in', allowMultiple: true }));
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

  it("settles a gate on named approved/rejected out-ports, exactly like condition's true/false (Theme D)", () => {
    const n: WorkflowNode = {
      id: 'g',
      label: 'Ship it?',
      x: 0,
      y: 0,
      kind: 'gate',
      config: { title: 'Ship it?', instructions: '', onTimeout: 'reject' },
    };
    const ports = portsForNode(n);
    expect(ports.map((p) => p.id)).toEqual(['in', 'approved', 'rejected', WORKFLOW_ERROR_PORT_ID]);
    expect(ports.filter((p) => p.direction === 'out').map((p) => p.id)).toEqual([
      'approved',
      'rejected',
      WORKFLOW_ERROR_PORT_ID,
    ]);
  });

  it('gives a router one out-port per declared case, plus the fixed default and error ports (Theme F)', () => {
    const n: WorkflowNode = {
      id: 'r',
      label: 'Route',
      x: 0,
      y: 0,
      kind: 'router',
      config: {
        mode: 'expression',
        cases: [
          { id: 'urgent', label: 'Urgent', when: { left: '{{a.risk}}', op: 'gt', right: '80' } },
          { id: 'low', label: 'Low', when: { left: '{{a.risk}}', op: 'lt', right: '20' } },
        ],
      },
    };
    const ports = portsForNode(n);
    expect(ports.map((p) => p.id)).toEqual(['in', 'urgent', 'low', WORKFLOW_ROUTER_DEFAULT_PORT_ID, WORKFLOW_ERROR_PORT_ID]);
    expect(ports.find((p) => p.id === 'urgent')?.label).toBe('Urgent');
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

// --- Phase 97 Theme C: controlled cycles --------------------------------------

function buildNode(id: string): WorkflowNode {
  return { id, label: id, x: 0, y: 0, kind: 'delay', config: { ms: 0 } };
}

function loopWorkflow(): { build: WorkflowNode; verify: WorkflowNode; decide: WorkflowNode; done: WorkflowNode } {
  return {
    build: buildNode('build'),
    verify: buildNode('verify'),
    decide: {
      id: 'decide',
      label: 'Passed?',
      x: 0,
      y: 0,
      kind: 'condition',
      config: { left: '{{verify.passed}}', op: 'eq', right: 'true' },
    },
    done: buildNode('done'),
  };
}

describe('portsForNode (Theme C: the exhausted port)', () => {
  it('adds no exhausted port when edges are omitted, or when the node has no outgoing loop edge', () => {
    const { decide } = loopWorkflow();
    expect(portsForNode(decide).some((p) => p.id === WORKFLOW_LOOP_EXHAUSTED_PORT_ID)).toBe(false);
    expect(portsForNode(decide, []).some((p) => p.id === WORKFLOW_LOOP_EXHAUSTED_PORT_ID)).toBe(false);
  });

  it('adds the exhausted out-port when the node sources a loop edge', () => {
    const { decide } = loopWorkflow();
    const edges: WorkflowEdge[] = [
      { id: 'loop1', from: 'decide', to: 'build', fromPort: 'false', kind: 'loop', loop: { maxIterations: 3, budgetMs: 60_000 } },
    ];
    const exhausted = portsForNode(decide, edges).find((p) => p.id === WORKFLOW_LOOP_EXHAUSTED_PORT_ID);
    expect(exhausted).toMatchObject({ direction: 'out', type: 'any' });
  });
});

describe('canConnectLoop', () => {
  const outPort = (id = 'false'): WorkflowPort => ({ id, label: id, direction: 'out', type: 'any' });
  const inPort = (): WorkflowPort => ({ id: 'in', label: 'In', direction: 'in', type: 'any', allowMultiple: true });

  it('allows a back-edge that closes a cycle over the existing non-loop edges', () => {
    const { build, decide } = loopWorkflow();
    const existing: WorkflowEdge[] = [
      { id: 'e1', from: 'build', to: 'verify' },
      { id: 'e2', from: 'verify', to: 'decide' },
    ];
    expect(canConnectLoop(decide, outPort(), build, inPort(), existing)).toEqual({ ok: true });
  });

  it('rejects a "loop" edge that does not actually close a cycle', () => {
    const { build, decide } = loopWorkflow();
    // No path from build back to decide exists, so decide -> build closes nothing.
    expect(canConnectLoop(decide, outPort(), build, inPort(), []).ok).toBe(false);
  });

  it('still rejects the ordinary port/direction mistakes', () => {
    const { build, decide } = loopWorkflow();
    expect(canConnectLoop(decide, inPort(), build, inPort(), []).ok).toBe(false);
    expect(canConnectLoop(decide, outPort(), decide, inPort(), []).ok).toBe(false);
  });
});

describe('findAcyclicEdgeViolation', () => {
  it('reports no violation for a cycle closed entirely by a loop edge', () => {
    const ids = ['build', 'verify', 'decide'];
    const edges: WorkflowEdge[] = [
      { id: 'e1', from: 'build', to: 'verify' },
      { id: 'e2', from: 'verify', to: 'decide' },
      { id: 'loop1', from: 'decide', to: 'build', kind: 'loop', loop: { maxIterations: 3, budgetMs: 1000 } },
    ];
    expect(findAcyclicEdgeViolation(ids, edges)).toBeNull();
  });

  it('still catches a cycle made only of non-loop edges', () => {
    const ids = ['a', 'b', 'c'];
    const edges: WorkflowEdge[] = [
      { id: 'e1', from: 'a', to: 'b' },
      { id: 'e2', from: 'b', to: 'c' },
      { id: 'e3', from: 'c', to: 'a' },
    ];
    expect(findAcyclicEdgeViolation(ids, edges)).not.toBeNull();
  });
});

describe('loopBodyNodeIds', () => {
  it('is every node on a path from the loop target forward to the loop source, inclusive', () => {
    const edges: WorkflowEdge[] = [
      { id: 'e1', from: 'build', to: 'verify' },
      { id: 'e2', from: 'verify', to: 'decide' },
      { id: 'loop1', from: 'decide', to: 'build', kind: 'loop' },
    ];
    expect(loopBodyNodeIds({ from: 'decide', to: 'build' }, edges)).toEqual(
      new Set(['build', 'verify', 'decide']),
    );
  });

  it('excludes a sibling branch that is not on the loop path', () => {
    const edges: WorkflowEdge[] = [
      { id: 'e1', from: 'build', to: 'verify' },
      { id: 'e2', from: 'verify', to: 'decide' },
      { id: 'e3', from: 'build', to: 'sideNote' }, // not on the decide->build path
      { id: 'loop1', from: 'decide', to: 'build', kind: 'loop' },
    ];
    const body = loopBodyNodeIds({ from: 'decide', to: 'build' }, edges);
    expect(body.has('sideNote')).toBe(false);
  });
});

describe('validateWorkflow (Theme C: loop edges)', () => {
  it('rejects a loop edge with no maxIterations/budget', () => {
    const { build, verify, decide, done } = loopWorkflow();
    const w: Workflow = {
      id: 'w',
      name: 'Loop',
      nodes: [build, verify, decide, done],
      edges: [
        { id: 'e1', from: 'build', to: 'verify' },
        { id: 'e2', from: 'verify', to: 'decide' },
        { id: 'e3', from: 'decide', to: 'done', fromPort: 'true' },
        { id: 'loop1', from: 'decide', to: 'build', fromPort: 'false', kind: 'loop' },
      ],
      createdAt: 1,
      updatedAt: 1,
    };
    const issues = validateWorkflow(w);
    expect(issues.some((i) => i.edgeId === 'loop1' && i.message.includes('maxIterations'))).toBe(true);
  });

  it('rejects a loop edge that does not close a cycle', () => {
    const { build, verify, decide, done } = loopWorkflow();
    const w: Workflow = {
      id: 'w',
      name: 'Loop',
      nodes: [build, verify, decide, done],
      edges: [
        { id: 'e1', from: 'build', to: 'verify' },
        { id: 'e2', from: 'verify', to: 'decide' },
        // "loop" edge points somewhere that isn't upstream of decide at all.
        { id: 'loop1', from: 'decide', to: 'done', kind: 'loop', loop: { maxIterations: 3, budgetMs: 1000 } },
      ],
      createdAt: 1,
      updatedAt: 1,
    };
    const issues = validateWorkflow(w);
    expect(issues.some((i) => i.edgeId === 'loop1' && i.message.includes('does not close a cycle'))).toBe(true);
  });

  it('accepts a well-formed loop edge, and resolves its exhausted port', () => {
    const { build, verify, decide, done } = loopWorkflow();
    const gate = buildNode('gate');
    const w: Workflow = {
      id: 'w',
      name: 'Loop',
      nodes: [build, verify, decide, done, gate],
      edges: [
        { id: 'e1', from: 'build', to: 'verify' },
        { id: 'e2', from: 'verify', to: 'decide' },
        { id: 'e3', from: 'decide', to: 'done', fromPort: 'true' },
        { id: 'loop1', from: 'decide', to: 'build', fromPort: 'false', kind: 'loop', loop: { maxIterations: 3, budgetMs: 1000 } },
        { id: 'e4', from: 'decide', to: 'gate', fromPort: 'exhausted', toPort: 'in' },
      ],
      createdAt: 1,
      updatedAt: 1,
    };
    expect(validateWorkflow(w)).toEqual([]);
  });
});

describe('WorkflowEdgeSchema (Theme C: loop bounds)', () => {
  it('parses a well-formed loop edge', () => {
    const edge = {
      id: 'loop1',
      from: 'decide',
      to: 'build',
      kind: 'loop',
      loop: { maxIterations: 5, budgetMs: 60_000, convergence: { kind: 'dry-rounds', rounds: 2, keyPath: 'idea.id' } },
    };
    expect(WorkflowEdgeSchema.safeParse(edge).success).toBe(true);
  });

  it(`rejects maxIterations above ${WORKFLOW_LOOP_MAX_ITERATIONS}`, () => {
    const edge = { id: 'loop1', from: 'a', to: 'b', kind: 'loop', loop: { maxIterations: 21, budgetMs: 1000 } };
    expect(WorkflowEdgeSchema.safeParse(edge).success).toBe(false);
  });
});

describe('hashLoopKey / readLoopKeyPath', () => {
  it('hashes equal values identically and different values differently', () => {
    expect(hashLoopKey('idea-1')).toBe(hashLoopKey('idea-1'));
    expect(hashLoopKey('idea-1')).not.toBe(hashLoopKey('idea-2'));
  });

  it('walks a dotted path against an arbitrary output', () => {
    expect(readLoopKeyPath({ idea: { id: 'x1' } }, 'idea.id')).toBe('x1');
    expect(readLoopKeyPath({ idea: { id: 'x1' } }, 'idea.missing')).toBeUndefined();
    expect(readLoopKeyPath(null, 'a.b')).toBeUndefined();
  });
});

describe('formatLoopFailuresBlock', () => {
  it('is empty for no failures', () => {
    expect(formatLoopFailuresBlock([])).toBe('');
  });

  it('lists each failure by iteration', () => {
    const block = formatLoopFailuresBlock([
      { iteration: 1, nodeId: 'verify', message: 'expected 200, got 500' },
    ]);
    expect(block).toContain('iteration 1');
    expect(block).toContain('verify');
    expect(block).toContain('expected 200, got 500');
  });
});

describe('nodeRunIteration / workflowLoopStates (Theme C readers)', () => {
  it('read a missing field as the pre-Theme-C default', () => {
    expect(nodeRunIteration({})).toBe(1);
    expect(nodeRunIteration({ iteration: 3 })).toBe(3);
    expect(workflowLoopStates({})).toEqual([]);
  });
});

describe('WorkflowVerifyConfigSchema / verify node (Theme E)', () => {
  it('round-trips every check kind through JSON unchanged', () => {
    const configs: WorkflowVerifyConfig[] = [
      { check: 'agent', agentId: 'claude', prompt: 'Grade this.', model: 'opus' },
      { check: 'exit-code', command: 'npm test', cwd: '/repo', env: { CI: '1' } },
      { check: 'test-counts', command: 'vitest --reporter=json', cwd: undefined, env: {}, parser: 'vitest', minPassed: 1 },
      { check: 'json-path', source: '{{a.status}}', op: 'eq', right: '200' },
    ];
    for (const config of configs) {
      const n = verifyNode({ config });
      expect(WorkflowNodeSchema.parse(JSON.parse(JSON.stringify(n)))).toEqual(n);
    }
  });

  it('rejects a check kind outside the closed vocabulary', () => {
    const result = WorkflowNodeSchema.safeParse(verifyNode({ config: { check: 'llm-vibes' } as unknown as WorkflowVerifyConfig }));
    expect(result.success).toBe(false);
  });

  it('rejects json-path with a non-empty op and no right-hand value at the schema level too — right stays optional, so this is validateWorkflow\'s job, not zod\'s', () => {
    // Documents the boundary: zod alone accepts `right: undefined` for any op
    // (the same "half-built workflow must still save" reasoning `condition`
    // already relies on) — `validateWorkflow`'s own test above is what
    // actually enforces the rule at run time.
    const parsed = WorkflowNodeSchema.safeParse(
      verifyNode({ config: { check: 'json-path', source: '{{a.status}}', op: 'eq' } }),
    );
    expect(parsed.success).toBe(true);
  });
});

describe('WorkflowTriggerConfigSchema (Theme H)', () => {
  const triggerNode = (config: unknown): unknown => ({
    id: 't',
    label: 'Start',
    x: 0,
    y: 0,
    kind: 'trigger',
    config,
  });

  it('parses manual, schedule and forge-pr variants', () => {
    expect(WorkflowNodeSchema.safeParse(triggerNode({ on: 'manual' })).success).toBe(true);
    expect(WorkflowNodeSchema.safeParse(triggerNode({ on: 'schedule', cron: '0 9 * * *' })).success).toBe(true);
    expect(
      WorkflowNodeSchema.safeParse(
        triggerNode({ on: 'forge-pr', repoId: 'repo-1', events: ['opened'], branchFilter: 'release/*' }),
      ).success,
    ).toBe(true);
  });

  it('fails to parse a schedule with a malformed cron string', () => {
    expect(WorkflowNodeSchema.safeParse(triggerNode({ on: 'schedule', cron: 'not a cron' })).success).toBe(false);
    expect(WorkflowNodeSchema.safeParse(triggerNode({ on: 'schedule', cron: '* * * *' })).success).toBe(false);
  });

  it('fails to parse a forge-pr trigger with no repoId or an empty events list', () => {
    expect(WorkflowNodeSchema.safeParse(triggerNode({ on: 'forge-pr', repoId: '', events: ['opened'] })).success).toBe(
      false,
    );
    expect(WorkflowNodeSchema.safeParse(triggerNode({ on: 'forge-pr', repoId: 'repo-1', events: [] })).success).toBe(
      false,
    );
  });

  it('defaults forge-pr events to both opened and updated', () => {
    const parsed = WorkflowNodeSchema.parse(triggerNode({ on: 'forge-pr', repoId: 'repo-1' }));
    expect(parsed.kind === 'trigger' && parsed.config.on === 'forge-pr' && parsed.config.events).toEqual([
      'opened',
      'updated',
    ]);
  });
});
