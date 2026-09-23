import dagre from '@dagrejs/dagre';
import type { WorkflowEdge, WorkflowNode } from '@midnite/studio-shared';
import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';

/** Card size on the canvas — matches the hand-rolled SVG canvas's old `WORKFLOW_NODE_GEOMETRY`, so a re-`Tidy` lays nodes out at the same footprint they always had. */
export const WORKFLOW_FLOW_NODE_WIDTH = 200;
export const WORKFLOW_FLOW_NODE_HEIGHT = 64;

export type WorkflowNodeData = { node: WorkflowNode };

/**
 * `WorkflowNode`/`WorkflowEdge` (`shared/src/workflow.ts`) → React Flow's own
 * `Node`/`Edge` shape (Phase 95 Theme I).
 *
 * **The "position migration" this phase's checklist calls for is this
 * function, not a coordinate transform.** `WorkflowNodeBaseSchema.x`/`.y` were
 * always plain top-left pixel floats — the hand-rolled SVG canvas placed a
 * node's `<g transform="translate(x, y)">` directly from them — and React
 * Flow's own `node.position` is the identical top-left-pixel convention,
 * so an existing workflow's saved positions open exactly where they always
 * did with no scaling, flipping or re-basing. What *does* need adapting is
 * the shape around those two numbers (a discriminated union with `id`/`kind`/
 * `config` folded into `data.node`, not spread across top-level fields React
 * Flow does not know about) — that shape adaptation is what this module is.
 */
export function toFlowNodes(nodes: readonly WorkflowNode[]): Node<WorkflowNodeData>[] {
  return nodes.map((node) => ({
    id: node.id,
    type: 'workflow',
    position: { x: node.x, y: node.y },
    data: { node },
  }));
}

export function toFlowEdges(edges: readonly WorkflowEdge[]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed },
  }));
}

/** The inverse of {@link toFlowNodes} for the one field a drag/layout pass can change — position. */
export function applyFlowPositions(
  nodes: readonly WorkflowNode[],
  positions: ReadonlyMap<string, { x: number; y: number }>,
): WorkflowNode[] {
  return nodes.map((node) => {
    const next = positions.get(node.id);
    return next ? { ...node, x: next.x, y: next.y } : node;
  });
}

/**
 * "Tidy" — a dagre layered layout over the current graph, left-to-right
 * (`rankdir: 'LR'`, matching a workflow's natural "runs left to right" read).
 * `note` nodes have no edges (`validateWorkflow` refuses to connect one), so
 * dagre places every disconnected note in its own rank at the layout's
 * fringe — acceptable for a label with nothing to align against, and never
 * worse than where it already was.
 *
 * Returns node id → the new top-left position, in the same `x`/`y`
 * convention `toFlowNodes` reads — dagre itself hands back **centre**
 * coordinates, so every node is re-based by half its own footprint here
 * before it reaches a caller.
 */
export function layoutWithDagre(
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
): Map<string, { x: number; y: number }> {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: 'LR', nodesep: 32, ranksep: 96 });

  for (const node of nodes) {
    graph.setNode(node.id, { width: WORKFLOW_FLOW_NODE_WIDTH, height: WORKFLOW_FLOW_NODE_HEIGHT });
  }
  const nodeIds = new Set(nodes.map((node) => node.id));
  for (const edge of edges) {
    if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) graph.setEdge(edge.from, edge.to);
  }

  dagre.layout(graph);

  const positions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    const laidOut = graph.node(node.id) as { x: number; y: number } | undefined;
    if (!laidOut) continue;
    positions.set(node.id, {
      x: laidOut.x - WORKFLOW_FLOW_NODE_WIDTH / 2,
      y: laidOut.y - WORKFLOW_FLOW_NODE_HEIGHT / 2,
    });
  }
  return positions;
}
