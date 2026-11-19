// Pure geometry for the Graph view (Phase 146 H4): a port of the desktop canvas's edge curve and viewport maths, with
// the 200x64 compact node size the mobile design uses. Kept here (not imported from `packages/frame`) because the
// frame is a renderer-side package mobile does not take.
import { rectsIntersect, type Rect, type Viewport } from '@midnite/tasks-core';
import type { ForgeGraphGeometry, PositionedEdge, PositionedNode } from '@midnite/tasks-core';

export const MOBILE_GRAPH_GEOMETRY: ForgeGraphGeometry = { width: 200, height: 64, rankGap: 96, nodeGap: 20 };
export const MIN_SCALE = 0.3;
export const MAX_SCALE = 2.5;
export const FIT_PADDING = 24;
/** Desktop culls with one node width of margin; the same rule here. */
export const CULL_MARGIN = MOBILE_GRAPH_GEOMETRY.width;

const round = (n: number) => Math.round(n * 100) / 100;

/** A cubic bezier with horizontal control points, port-to-port, as an SVG path `d`. */
export function edgePath(startX: number, startY: number, endX: number, endY: number): string {
  const controlX = round((startX + endX) / 2);
  return `M ${round(startX)} ${round(startY)} C ${controlX} ${round(startY)}, ${controlX} ${round(endY)}, ${round(endX)} ${round(endY)}`;
}

export const outPort = (node: Pick<PositionedNode, 'x' | 'y'>) => ({
  x: node.x + MOBILE_GRAPH_GEOMETRY.width,
  y: node.y + MOBILE_GRAPH_GEOMETRY.height / 2,
});
export const inPort = (node: Pick<PositionedNode, 'x' | 'y'>) => ({ x: node.x, y: node.y + MOBILE_GRAPH_GEOMETRY.height / 2 });

export const nodeRect = (node: Pick<PositionedNode, 'x' | 'y'>): Rect => ({
  x: node.x,
  y: node.y,
  width: MOBILE_GRAPH_GEOMETRY.width,
  height: MOBILE_GRAPH_GEOMETRY.height,
});

export const clampScale = (scale: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/** The graph-space rect currently on screen, widened by `margin` on every side. */
export function viewportRect(viewport: Viewport, width: number, height: number, margin = 0): Rect {
  return {
    x: viewport.x - margin,
    y: viewport.y - margin,
    width: width / viewport.scale + margin * 2,
    height: height / viewport.scale + margin * 2,
  };
}

/**
 * Zoom by `factor` about a focal point given in screen px, so the graph point under the fingers stays put. `viewport`
 * is the graph-space top-left plus scale (`screen = (graph - viewport) * scale`).
 */
export function zoomAt(viewport: Viewport, factor: number, focalX: number, focalY: number): Viewport {
  const scale = clampScale(viewport.scale * factor);
  const gx = viewport.x + focalX / viewport.scale;
  const gy = viewport.y + focalY / viewport.scale;
  return { scale, x: gx - focalX / scale, y: gy - focalY / scale };
}

/** Pan by a screen-space delta (dragging right moves the graph right, so the viewport origin moves left). */
export const panBy = (viewport: Viewport, dx: number, dy: number): Viewport => ({
  ...viewport,
  x: viewport.x - dx / viewport.scale,
  y: viewport.y - dy / viewport.scale,
});

/** Nodes and edges that intersect the culled viewport. An edge is kept when its bounding box does. */
export function cullToViewport(
  nodes: readonly PositionedNode[],
  edges: readonly PositionedEdge[],
  visible: Rect,
): { nodes: PositionedNode[]; edges: PositionedEdge[] } {
  const byKey = new Map(nodes.map((n) => [n.key, n] as const));
  const keptEdges = edges.filter((edge) => {
    const from = byKey.get(edge.from);
    const to = byKey.get(edge.to);
    if (!from || !to) return false;
    return rectsIntersect(
      {
        x: Math.min(from.x, to.x),
        y: Math.min(from.y, to.y),
        width: Math.abs(to.x - from.x) + MOBILE_GRAPH_GEOMETRY.width,
        height: Math.abs(to.y - from.y) + MOBILE_GRAPH_GEOMETRY.height,
      },
      visible,
    );
  });
  return { nodes: nodes.filter((n) => rectsIntersect(nodeRect(n), visible)), edges: keptEdges };
}
