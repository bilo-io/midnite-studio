import type { WorkflowEdge, WorkflowNode } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { autoLayout, fromFlowPosition, toFlowGraph, toFlowPosition } from './workflow-layout';

function node(id: string, x: number, y: number): WorkflowNode {
  return { id, label: id, x, y, kind: 'note', config: { text: '' } };
}

describe('toFlowPosition / fromFlowPosition (position migration)', () => {
  it('is the identity map — an existing workflow saved before Theme I opens with its layout unchanged', () => {
    expect(toFlowPosition({ x: 120.5, y: -40 })).toEqual({ x: 120.5, y: -40 });
    expect(fromFlowPosition({ x: 120.5, y: -40 })).toEqual({ x: 120.5, y: -40 });
  });

  it('round-trips through both directions', () => {
    const original = { x: 37, y: 402 };
    expect(fromFlowPosition(toFlowPosition(original))).toEqual(original);
  });
});

describe('toFlowGraph', () => {
  it('maps every node to a workflowNode positioned at its saved x/y', () => {
    const nodes = [node('a', 0, 0), node('b', 300, 120)];
    const edges: WorkflowEdge[] = [{ id: 'e1', from: 'a', to: 'b' }];
    const { nodes: flowNodes, edges: flowEdges } = toFlowGraph(nodes, edges);

    expect(flowNodes).toHaveLength(2);
    expect(flowNodes[0]).toMatchObject({ id: 'a', type: 'workflowNode', position: { x: 0, y: 0 } });
    expect(flowNodes[1]).toMatchObject({ id: 'b', type: 'workflowNode', position: { x: 300, y: 120 } });
    expect(flowEdges).toEqual([{ id: 'e1', source: 'a', target: 'b', type: 'smoothstep', animated: true }]);
  });
});

describe('autoLayout', () => {
  it('positions every node, left-to-right in edge order', () => {
    const nodes = [node('a', 0, 0), node('b', 0, 0), node('c', 0, 0)];
    const edges: WorkflowEdge[] = [
      { id: 'e1', from: 'a', to: 'b' },
      { id: 'e2', from: 'b', to: 'c' },
    ];
    const positions = autoLayout(nodes, edges);

    expect(positions.size).toBe(3);
    const a = positions.get('a')!;
    const b = positions.get('b')!;
    const c = positions.get('c')!;
    // `rankdir: 'LR'` — each rank sits strictly to the right of its parent's.
    expect(a.x).toBeLessThan(b.x);
    expect(b.x).toBeLessThan(c.x);
  });

  it('ignores an edge whose endpoint is not in the node list', () => {
    const nodes = [node('a', 0, 0)];
    const edges: WorkflowEdge[] = [{ id: 'e1', from: 'a', to: 'missing' }];
    expect(() => autoLayout(nodes, edges)).not.toThrow();
    expect(autoLayout(nodes, edges).size).toBe(1);
  });

  it('spaces disconnected nodes apart rather than stacking them at one point', () => {
    const nodes = [node('a', 0, 0), node('b', 0, 0)];
    const positions = autoLayout(nodes, []);
    const a = positions.get('a')!;
    const b = positions.get('b')!;
    expect(Math.abs(a.y - b.y)).toBeGreaterThan(0);
  });
});
