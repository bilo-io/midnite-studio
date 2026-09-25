import type { WorkflowEdge, WorkflowNode } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import {
  autoLayout,
  fromFlowPosition,
  toFlowGraph,
  toFlowPosition,
  WORKFLOW_FRAME_LAYOUT_PADDING,
  WORKFLOW_NODE_HEIGHT,
  WORKFLOW_NODE_WIDTH,
} from './workflow-layout';

function node(id: string, x: number, y: number, frameId?: string): WorkflowNode {
  return { id, label: id, x, y, kind: 'note', config: { text: '' }, ...(frameId !== undefined ? { frameId } : {}) };
}

function frameNode(id: string, x = 0, y = 0, width = 400, height = 200): WorkflowNode {
  return {
    id,
    label: 'THE AGENT HARNESS',
    x,
    y,
    kind: 'frame',
    config: { contract: '', context: '', state: '', tools: '', permissions: '', evidence: '', width, height },
  };
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
    expect(flowEdges).toEqual([
      {
        id: 'e1',
        source: 'a',
        target: 'b',
        sourceHandle: undefined,
        targetHandle: undefined,
        type: 'workflowEdge',
        data: { edge: edges[0] },
      },
    ]);
  });

  it('sorts frame nodes first (Theme I) — React Flow paints later entries on top, so this puts member cards above their frame', () => {
    const nodes = [node('member', 10, 10), frameNode('f'), node('other', 20, 20)];
    const { nodes: flowNodes } = toFlowGraph(nodes, []);
    expect(flowNodes.map((n) => n.id)).toEqual(['f', 'member', 'other']);
  });

  it('sizes a frame node from its own config, not the fixed card size every other kind uses', () => {
    const { nodes: flowNodes } = toFlowGraph([frameNode('f', 0, 0, 640, 320)], []);
    const frame = flowNodes.find((n) => n.id === 'f')!;
    expect(frame.width).toBe(640);
    expect(frame.height).toBe(320);
    expect(frame.zIndex).toBe(-1);
  });

  it('sizes an ordinary node from the fixed card constants, unaffected by any frame in the same graph', () => {
    const { nodes: flowNodes } = toFlowGraph([frameNode('f'), node('a', 0, 0)], []);
    const plain = flowNodes.find((n) => n.id === 'a')!;
    expect(plain.width).toBe(WORKFLOW_NODE_WIDTH);
    expect(plain.height).toBe(WORKFLOW_NODE_HEIGHT);
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

  it('ignores a loop-kind edge for ranking — a back-edge never drags the earlier node rightward', () => {
    const nodes = [node('a', 0, 0), node('b', 0, 0), node('c', 0, 0)];
    const withLoop = autoLayout(nodes, [
      { id: 'e1', from: 'a', to: 'b' },
      { id: 'e2', from: 'b', to: 'c' },
      { id: 'e3', from: 'c', to: 'b', kind: 'loop' },
    ]);
    const withoutLoop = autoLayout(nodes, [
      { id: 'e1', from: 'a', to: 'b' },
      { id: 'e2', from: 'b', to: 'c' },
    ]);
    // Same ranking either way — the `loop` edge back to `b` never entered dagre.
    expect(withLoop.get('a')).toEqual(withoutLoop.get('a'));
    expect(withLoop.get('b')).toEqual(withoutLoop.get('b'));
    expect(withLoop.get('c')).toEqual(withoutLoop.get('c'));
  });

  describe('frame containment (Phase 97 Theme I)', () => {
    it("bounds a frame's next position/size to its members' padded bounding box, once dagre has placed them", () => {
      const nodes = [frameNode('f'), node('a', 0, 0, 'f'), node('b', 0, 0, 'f')];
      const edges: WorkflowEdge[] = [{ id: 'e1', from: 'a', to: 'b' }];
      const positions = autoLayout(nodes, edges);

      const a = positions.get('a')!;
      const b = positions.get('b')!;
      const frame = positions.get('f')!;

      const minX = Math.min(a.x, b.x);
      const minY = Math.min(a.y, b.y);
      const maxX = Math.max(a.x, b.x) + WORKFLOW_NODE_WIDTH;
      const maxY = Math.max(a.y, b.y) + WORKFLOW_NODE_HEIGHT;

      expect(frame.x).toBe(minX - WORKFLOW_FRAME_LAYOUT_PADDING);
      expect(frame.y).toBe(minY - WORKFLOW_FRAME_LAYOUT_PADDING);
      expect(frame.width).toBe(maxX - minX + WORKFLOW_FRAME_LAYOUT_PADDING * 2);
      expect(frame.height).toBe(maxY - minY + WORKFLOW_FRAME_LAYOUT_PADDING * 2);
    });

    it('leaves a frame with no members out of the position map entirely — its last position/size survives auto-layout untouched', () => {
      const nodes = [frameNode('f', 100, 200, 400, 200), node('a', 0, 0)];
      const positions = autoLayout(nodes, []);
      expect(positions.has('f')).toBe(false);
    });

    it('never enters a frame node into dagre — it has no edges to rank by', () => {
      // A frame with an (invalid, `validateWorkflow` would reject it) edge
      // touching it must not crash dagre or claim a rank.
      const nodes = [frameNode('f'), node('a', 0, 0)];
      const edges: WorkflowEdge[] = [{ id: 'e1', from: 'f', to: 'a' }];
      expect(() => autoLayout(nodes, edges)).not.toThrow();
    });
  });
});
