import type { WorkflowNode } from '@midnite/studio-shared';

import { WORKFLOW_NODE_GEOMETRY, WORKFLOW_ZOOM_BOUNDS, type Viewport } from './workflow-geometry';

/**
 * The canvas's coordinate maths, as pure functions — kept out of
 * `workflow-canvas.tsx` for the reason `metric-path.ts` gives for its own
 * arithmetic: it is arithmetic with an off-by-half in it, and arithmetic that
 * can be wrong should be testable without mounting anything.
 *
 * A node's `x`/`y` is its **top-left corner**. `viewBox` is
 * `${x} ${y} ${containerWidth / scale} ${containerHeight / scale}`, which is
 * why every pointer→graph conversion below only needs `scale`, not the
 * container's pixel size — the two cancel.
 */

export type Rect = { x: number; y: number; width: number; height: number };

export function nodeBounds(node: Pick<WorkflowNode, 'x' | 'y'>): Rect {
  return { x: node.x, y: node.y, width: WORKFLOW_NODE_GEOMETRY.width, height: WORKFLOW_NODE_GEOMETRY.height };
}

/** The port a node's outgoing edges leave from (right edge, vertical centre). */
export function outPort(node: Pick<WorkflowNode, 'x' | 'y'>): { x: number; y: number } {
  return { x: node.x + WORKFLOW_NODE_GEOMETRY.width, y: node.y + WORKFLOW_NODE_GEOMETRY.height / 2 };
}

/** The port a node's incoming edges arrive at (left edge, vertical centre). */
export function inPort(node: Pick<WorkflowNode, 'x' | 'y'>): { x: number; y: number } {
  return { x: node.x, y: node.y + WORKFLOW_NODE_GEOMETRY.height / 2 };
}

/**
 * The edge itself: a cubic bezier with **horizontal** control points, the
 * transpose of `graph-svg.tsx`'s `edgePath` — that graph flows top-to-bottom
 * so its control points are vertical (`controlY = mid(startY, endY)`); a
 * workflow flows left-to-right, so the control points here are
 * `controlX = mid(startX, endX)` instead. Same shape, different axis.
 */
export function edgePath(startX: number, startY: number, endX: number, endY: number): string {
  const controlX = round((startX + endX) / 2);
  return `M ${round(startX)} ${round(startY)} C ${controlX} ${round(startY)}, ${controlX} ${round(endY)}, ${round(endX)} ${round(endY)}`;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** The graph-space rect currently visible, widened by `margin` on every side for culling. */
export function viewportRect(viewport: Viewport, containerWidth: number, containerHeight: number, margin = 0): Rect {
  const width = containerWidth / viewport.scale + margin * 2;
  const height = containerHeight / viewport.scale + margin * 2;
  return { x: viewport.x - margin, y: viewport.y - margin, width, height };
}

/** A pointer position local to the canvas container (CSS pixels) → graph coordinates. */
export function clientToGraph(viewport: Viewport, localX: number, localY: number): { x: number; y: number } {
  return { x: viewport.x + localX / viewport.scale, y: viewport.y + localY / viewport.scale };
}

/** A pixel drag delta → the graph-space delta it represents at the current scale. */
export function dragDeltaToGraph(viewport: Viewport, dx: number, dy: number): { dx: number; dy: number } {
  return { dx: dx / viewport.scale, dy: dy / viewport.scale };
}

/** Plain wheel scroll pans; the delta is in the same pixel units the wheel event reports. */
export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return { ...viewport, x: viewport.x + dx / viewport.scale, y: viewport.y + dy / viewport.scale };
}

/**
 * `Ctrl`/`Cmd`-wheel zooms about the pointer, clamped to
 * {@link WORKFLOW_ZOOM_BOUNDS}. `localX`/`localY` are the pointer's position
 * local to the canvas container, in CSS pixels.
 *
 * The property that makes zoom feel right: the graph point under the pointer
 * before the zoom is the same graph point under the pointer after it. Solve
 * for the new `x`/`y` from `graphPoint = viewport.{x,y} + local/scale` held
 * constant across the scale change.
 */
export function zoomAtPointer(viewport: Viewport, localX: number, localY: number, rawNextScale: number): Viewport {
  const nextScale = Math.min(WORKFLOW_ZOOM_BOUNDS.max, Math.max(WORKFLOW_ZOOM_BOUNDS.min, rawNextScale));
  const graphX = viewport.x + localX / viewport.scale;
  const graphY = viewport.y + localY / viewport.scale;
  return { x: graphX - localX / nextScale, y: graphY - localY / nextScale, scale: nextScale };
}

/** Snap a dropped node position to the grid. */
export function snapToGrid(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Two decimals is well below a device pixel and keeps the `d` attribute short — same rule as `metric-path.ts`. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
