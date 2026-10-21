import { describe, expect, it } from 'vitest';

import {
  WORKFLOW_ERROR_PORT_ID,
  WorkflowNodeSchema,
  checkNodePolicy,
  nodeDeclaredActions,
  portsForNode,
  validateWorkflow,
  type Workflow,
  type WorkflowNode,
  type WorkflowNodeKind,
} from './workflow';

/**
 * The palette kinds added after Phase 97: each parses from a bare `config: {}`
 * (every field has a default, so a node the canvas just dropped is valid
 * JSON), each has the plain `in` / `error` port pair, and each reports its
 * own missing required fields through `validateWorkflow`.
 */
const PALETTE_KINDS = [
  'ai-prompt',
  'ai-extract',
  'assert',
  'fail',
  'command',
  'read-file',
  'git-status',
  'forge-comment',
  'forge-issue',
  'set-fields',
  'json-extract',
  'coalesce',
  'notify',
  'write-file',
  'clipboard',
] as const satisfies readonly WorkflowNodeKind[];

function parse(kind: WorkflowNodeKind, config: Record<string, unknown> = {}): WorkflowNode {
  return WorkflowNodeSchema.parse({ id: 'n', label: 'Step', x: 0, y: 0, kind, config });
}

function workflowOf(nodes: WorkflowNode[], edges: Workflow['edges'] = []): Workflow {
  return { id: 'w', name: 'W', nodes, edges, createdAt: 0, updatedAt: 0 };
}

describe('palette kinds', () => {
  it('parse from an empty config', () => {
    for (const kind of PALETTE_KINDS) expect(parse(kind).kind).toBe(kind);
  });

  it('each get the implicit in-port and error port', () => {
    for (const kind of PALETTE_KINDS) {
      const ports = portsForNode(parse(kind));
      expect(ports.some((p) => p.id === 'in' && p.direction === 'in'), kind).toBe(true);
      expect(ports.some((p) => p.id === WORKFLOW_ERROR_PORT_ID && p.direction === 'out'), kind).toBe(true);
    }
  });

  it('gives only `fail` no success out-port', () => {
    for (const kind of PALETTE_KINDS) {
      const hasOut = portsForNode(parse(kind)).some((p) => p.id === 'out');
      expect(hasOut, kind).toBe(kind !== 'fail');
    }
  });

  it('flags every empty required field, and nothing once filled in', () => {
    const empty: Record<string, string[]> = {};
    for (const kind of PALETTE_KINDS) {
      empty[kind] = validateWorkflow(workflowOf([parse(kind)])).map((issue) => issue.message);
    }
    expect(empty['fail']).toEqual([]);
    expect(empty['ai-prompt']).toEqual(['"Step" has no prompt.']);
    expect(empty['ai-extract']).toEqual(['"Step" has no source text.', '"Step" has no fields to extract.']);
    expect(empty['assert']).toEqual([
      '"Step" has no value to check.',
      '"Step" compares with "eq" but has no right-hand value.',
    ]);
    expect(empty['forge-comment']).toEqual([
      '"Step" has no repository.',
      '"Step" has no PR number.',
      '"Step" has no comment body.',
    ]);
    expect(empty['write-file']).toEqual(['"Step" has no path.']);

    const filled: WorkflowNode[] = [
      parse('ai-prompt', { prompt: 'hi' }),
      parse('ai-extract', { source: 'x', fields: [{ key: 'a' }] }),
      parse('assert', { left: '1', op: 'empty' }),
      parse('command', { command: 'true' }),
      parse('read-file', { path: '/tmp/a' }),
      parse('git-status', { repoId: 'r' }),
      parse('forge-comment', { repoId: 'r', number: '1', body: 'b' }),
      parse('forge-issue', { repoId: 'r', title: 't' }),
      parse('set-fields', { fields: { a: '1' } }),
      parse('json-extract', { source: '{}' }),
      parse('coalesce', { candidates: ['a'] }),
      parse('notify', { title: 't' }),
      parse('write-file', { path: '/tmp/a' }),
      parse('clipboard', { text: 't' }),
    ];
    for (const n of filled) expect(validateWorkflow(workflowOf([n])), n.kind).toEqual([]);
  });

  it('flags an ai-extract that asks for the same key twice', () => {
    const n = parse('ai-extract', { source: 'x', fields: [{ key: 'a' }, { key: 'a' }] });
    expect(validateWorkflow(workflowOf([n])).map((i) => i.message)).toEqual(['"Step" asks for the same field twice.']);
  });
});

describe('palette kinds under a policy', () => {
  const policy: WorkflowNode = {
    id: 'p',
    label: 'Policy',
    x: 0,
    y: 0,
    kind: 'policy',
    config: { allow: [], requireApprovalFor: [] },
  };

  it('write-file always declares write-files, so a policy that does not allow it blocks the run', () => {
    const write = { ...parse('write-file', { path: '/tmp/a' }), id: 'w' };
    expect(nodeDeclaredActions(write)).toEqual(['write-files']);
    const wf = workflowOf([policy, write], [{ id: 'e', from: 'p', to: 'w' }]);
    expect(checkNodePolicy(write, wf.nodes, wf.edges).denied).toEqual(['write-files']);
    expect(validateWorkflow(wf).map((i) => i.message)).toContain(
      '"Step" performs the "write-files" action, which no governing policy allows.',
    );
  });

  it('a command declares only the actions its author ticked', () => {
    expect(nodeDeclaredActions(parse('command', { command: 'true' }))).toEqual([]);
    expect(nodeDeclaredActions(parse('command', { command: 'true', actions: ['push'] }))).toEqual(['push']);
  });
});
