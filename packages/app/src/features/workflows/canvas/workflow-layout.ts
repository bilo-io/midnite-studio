import dagre from '@dagrejs/dagre';
import type { WorkflowEdge, WorkflowNode } from '@midnite/studio-shared';
import type { Edge, Node } from '@xyflow/react';

/**
 * The node card's fixed footprint on the canvas — both React Flow's default
 * node sizing (`workflow-node-view.tsx`'s root wears this width) and dagre's
 * per-node box, so the two never disagree about how much room a node needs.
 */
export const WORKFLOW_NODE_WIDTH = 200;
export const WORKFLOW_NODE_HEIGHT = 64;

/**
 * `WorkflowNode.x`/`.y` **are already React Flow node positions** — both are
 * a plain top-left-corner `{x, y}` in unscaled canvas pixels, the coordinate
 * system the hand-rolled SVG canvas (Phase 43) used and the one
 * `@xyflow/react` (Theme I) expects a `Node.position` to be in. So "migrate
 * saved SVG-canvas positions onto React Flow node positions" is this
 * identity mapping, not a coordinate transform — every workflow saved before
 * this theme opens with its layout untouched. A named function rather than
 * an inline `{x: node.x, y: node.y}` at each call site exists so that fact is
 * written down once, in the one place a reader would go looking for the
 * "migration" the phase doc's checklist names.
 */
export function toFlowPosition(node: Pick<WorkflowNode, 'x' | 'y'>): { x: number; y: number } {
  return { x: node.x, y: node.y };
}

/** The inverse of {@link toFlowPosition} — applied on drag-end to write a moved node back into `WorkflowNode.x`/`.y`. */
export function fromFlowPosition(position: { x: number; y: number }): { x: number; y: number } {
  return { x: position.x, y: position.y };
}

/**
 * Auto-arranges a graph left-to-right with dagre (Theme I's toolbar "Auto
 * layout" action) and returns each node's next `{x, y}`, keyed by id.
 *
 * **Never runs on open or on every edit** — only from the explicit toolbar
 * button. Running it silently on load would fight a user who dragged nodes
 * into a deliberate arrangement; the migration above is what keeps an
 * existing workflow's layout stable by default.
 *
 * `rankdir: 'LR'` matches the node card's own left-in/right-out ports
 * (`workflow-node-view.tsx`'s `Handle` placement) — the same left-to-right
 * flow the old SVG canvas drew.
 */
export function autoLayout(
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 32, ranksep: 96 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    g.setNode(node.id, { width: WORKFLOW_NODE_WIDTH, height: WORKFLOW_NODE_HEIGHT });
  }
  for (const edge of edges) {
    // A `loop` edge is a controlled back-edge (Phase 97 Theme C) — it always
    // points from a later node back to an earlier one, and feeding it to
    // dagre would either force a cycle dagre has to break arbitrarily or
    // drag the whole "earlier" side of the graph rightward to satisfy it.
    // Excluded from ranking here; `workflow-edge-view.tsx` still draws it,
    // curved, over whatever rank the other edges settle on. Checked inline
    // (`edge.kind === 'loop'`) rather than importing a helper from Theme C's
    // own branch, which is not merged yet.
    if (edge.kind === 'loop') continue;
    if (g.hasNode(edge.from) && g.hasNode(edge.to)) g.setEdge(edge.from, edge.to);
  }

  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    const laidOut = g.node(node.id) as { x: number; y: number } | undefined;
    if (!laidOut) continue;
    // dagre positions by CENTRE; React Flow (and this schema) positions by
    // top-left corner, the same adjustment `toFlowPosition`'s docblock notes.
    positions.set(node.id, { x: laidOut.x - WORKFLOW_NODE_WIDTH / 2, y: laidOut.y - WORKFLOW_NODE_HEIGHT / 2 });
  }
  return positions;
}

/** `WorkflowNode`/`WorkflowEdge` → React Flow's own `Node`/`Edge` shape, for the canvas's controlled render. */
export function toFlowGraph(
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: 'workflowNode',
      position: toFlowPosition(node),
      data: { node },
      width: WORKFLOW_NODE_WIDTH,
      height: WORKFLOW_NODE_HEIGHT,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      sourceHandle: edge.fromPort,
      targetHandle: edge.toPort,
      // `workflow-edge-view.tsx` (Theme J) owns styling and the taken/dead/
      // pending read entirely — `data.edge` is the raw `WorkflowEdge` so it
      // can read `kind`/`fromPort` itself rather than this function
      // pre-computing them; `sourceStatus`/`sourceSettledPort` are filled in
      // by `workflow-canvas.tsx`'s per-render edge decorate step, which is
      // the one place that has a run's per-node data.
      type: 'workflowEdge',
      data: { edge },
    })),
  };
}
