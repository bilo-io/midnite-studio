/**
 * The workflow canvas's fixed dimensions, as data — the same move
 * `metric-geometry.ts` makes for the monitor's charts: a coherent set of
 * numbers that have to move together, kept out of JSX and out of
 * `workflow-path.ts`'s arithmetic so both stay testable against one source.
 */
export const WORKFLOW_NODE_GEOMETRY = {
  width: 160,
  height: 56,
  /** Radius of the little port circle at each node's left/right edge. */
  portRadius: 5,
} as const;

/** Drop snaps to this; dragging itself is free. */
export const WORKFLOW_GRID_STEP = 16;

/** `viewBox` scale clamp — matches the doc's `[0.25, 2]`. */
export const WORKFLOW_ZOOM_BOUNDS = { min: 0.25, max: 2 } as const;

/** A node whose bounding box (widened by one node width) intersects the viewport renders. */
export const WORKFLOW_CULL_MARGIN = WORKFLOW_NODE_GEOMETRY.width;

/** Ring-buffer cap for canvas-local, in-session undo/redo. Not persisted. */
export const WORKFLOW_UNDO_LIMIT = 50;

export type Viewport = { x: number; y: number; scale: number };

export const WORKFLOW_DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 };
