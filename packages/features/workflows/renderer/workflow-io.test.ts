import { describe, expect, it } from 'vitest';

import { WorkflowNodeSchema, WORKFLOW_NODE_KINDS, type Workflow } from '@midnite/studio-shared';

import {
  cloneWorkflowWithFreshIds,
  createEmptyWorkflow,
  createNode,
  exportWorkflowFilename,
  exportWorkflowJson,
  parseImportedWorkflow,
} from './workflow-io';

function twoNodeWorkflow(): Workflow {
  return {
    id: 'wf-1',
    name: 'Fetch then log',
    nodes: [
      { id: 'n1', label: 'Fetch', x: 0, y: 0, kind: 'http', config: { method: 'GET', url: 'http://x', headers: {}, params: {}, queryShaped: false } },
      { id: 'n2', label: 'Note', x: 100, y: 0, kind: 'note', config: { text: '' } },
    ],
    edges: [{ id: 'e1', from: 'n1', to: 'n2' }],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('createEmptyWorkflow', () => {
  it('produces a fresh, empty, nameable workflow', () => {
    const a = createEmptyWorkflow(100);
    const b = createEmptyWorkflow(100);
    expect(a.id).not.toBe(b.id);
    expect(a.nodes).toEqual([]);
    expect(a.edges).toEqual([]);
  });
});

describe('cloneWorkflowWithFreshIds', () => {
  it('gives the workflow and every node a new id, remapping edges to match', () => {
    const original = twoNodeWorkflow();
    const clone = cloneWorkflowWithFreshIds(original, 200);

    expect(clone.id).not.toBe(original.id);
    expect(clone.nodes.map((n) => n.id)).not.toEqual(original.nodes.map((n) => n.id));
    expect(new Set(clone.nodes.map((n) => n.id)).size).toBe(2);

    const [cn1, cn2] = clone.nodes;
    expect(clone.edges[0]).toMatchObject({ from: cn1!.id, to: cn2!.id });
    // Content is preserved, only ids move.
    expect(clone.nodes.map((n) => n.label)).toEqual(original.nodes.map((n) => n.label));
  });

  it('overrides the name when given one, otherwise keeps it', () => {
    const original = twoNodeWorkflow();
    expect(cloneWorkflowWithFreshIds(original, 1).name).toBe('Fetch then log');
    expect(cloneWorkflowWithFreshIds(original, 1, 'Fetch then log (copy)').name).toBe(
      'Fetch then log (copy)',
    );
  });
});

describe('export / import round-trip', () => {
  it('round-trips through JSON with fresh ids and no data loss', () => {
    const original = twoNodeWorkflow();
    const json = exportWorkflowJson(original);
    const result = parseImportedWorkflow(json, 300);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workflow.id).not.toBe(original.id);
    expect(result.workflow.name).toBe(original.name);
    expect(result.workflow.nodes).toHaveLength(2);
    expect(result.workflow.edges).toHaveLength(1);
  });

  it('rejects unparseable JSON', () => {
    const result = parseImportedWorkflow('{not json', 1);
    expect(result).toEqual({ ok: false, error: 'Not valid JSON.' });
  });

  it('rejects JSON that is not a workflow', () => {
    const result = parseImportedWorkflow(JSON.stringify({ hello: 'world' }), 1);
    expect(result.ok).toBe(false);
  });
});

describe('createNode', () => {
  it('produces a schema-valid node for every kind, positioned where asked', () => {
    for (const kind of WORKFLOW_NODE_KINDS) {
      const node = createNode(kind, 10, 20);
      expect(node.x).toBe(10);
      expect(node.y).toBe(20);
      expect(WorkflowNodeSchema.safeParse(node).success).toBe(true);
    }
  });

  it('gives every call a fresh id', () => {
    expect(createNode('note', 0, 0).id).not.toBe(createNode('note', 0, 0).id);
  });
});

describe('exportWorkflowFilename', () => {
  it('slugifies the name', () => {
    expect(exportWorkflowFilename(twoNodeWorkflow())).toBe('fetch-then-log.json');
  });

  it('falls back for a name with no alphanumerics', () => {
    expect(exportWorkflowFilename({ ...twoNodeWorkflow(), name: '???' })).toBe('workflow.json');
  });
});
