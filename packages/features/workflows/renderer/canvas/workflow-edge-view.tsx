import type { WorkflowEdge, WorkflowNodeStatus } from '@midnite/studio-shared';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, type EdgeProps } from '@xyflow/react';

import type { CSSProperties } from 'react';

import { DEAD_EDGE_OPACITY, EDGE_KIND_STYLE, edgeAppearance, loopBoundsTitle, rendererEdgeState } from './edge-style';

/** `data` this edge type is mounted with — see `workflow-layout.ts`'s `toFlowGraph` and `workflow-canvas.tsx`'s per-render decorate step. */
export type WorkflowEdgeData = {
  edge: WorkflowEdge;
  sourceStatus?: WorkflowNodeStatus;
  sourceSettledPort?: string;
  /**
   * `n/max` while a controlled loop is mid-run — `workflow-canvas.tsx`'s
   * `iterationLabelFor` reads Theme C's `WorkflowLoopState`/`WorkflowEdge.loop`
   * for this; `undefined` renders no badge (no run has reached this loop
   * yet, or the edge isn't a `loop` edge at all).
   */
  iterationLabel?: string;
};

/**
 * The workflow canvas's custom edge (Phase 97 Theme J) — edge style per
 * `WorkflowEdgeKind` (`edge-style.ts`'s `EDGE_KIND_STYLE`) plus the
 * post-run taken/dead read (`rendererEdgeState`): a dead edge fades to
 * {@link DEAD_EDGE_OPACITY}, a taken edge keeps the animated dashes a
 * running/unstarted edge already had, and a still-pending edge (nothing
 * settled yet) draws exactly like `data`'s always did before this theme.
 *
 * `loop` is the one kind routed as a curved back-edge rather than
 * `getSmoothStepPath`'s orthogonal routing — a `loop` edge always points
 * from a later node back to an earlier one, and a straight or stepped line
 * between them would cross directly through every node in between. The
 * bezier control points are pushed well past the pair's own vertical span so
 * the curve arcs under the row of node bodies instead, matching the phase
 * doc's "routed under the body (not through it)".
 */
export function WorkflowEdgeView({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  selected,
}: EdgeProps) {
  const edgeData = data as unknown as WorkflowEdgeData;
  const kind = edgeData.edge.kind ?? 'data';
  const style = EDGE_KIND_STYLE[kind];
  const state = rendererEdgeState(edgeData.edge, edgeData.sourceStatus, edgeData.sourceSettledPort);

  const [path, labelX, labelY] = style.isBackEdge
    ? getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        // A generous, fixed curvature rather than the library's own
        // distance-scaled default — a short back-edge (adjacent nodes) still
        // needs to clear a full node height, which the default curvature
        // (proportional to the short horizontal gap) would not reach.
        curvature: 0.9,
      })
    : getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 6 });

  // Colour, width, opacity (rest and hover, both clamped to 50–90%) and the
  // marching-dash animation all come from `edgeAppearance` — the one place an
  // edge's look is derived. `wf-edge-live`'s keyframe (`styles.css`) is
  // itself gated under `prefers-reduced-motion: no-preference` — the motion
  // policy this canvas otherwise follows for the activity glow.
  const look = edgeAppearance({ kind, state, running: edgeData.sourceStatus === 'running', selected: selected ?? false });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={
          {
            stroke: look.stroke,
            strokeWidth: look.strokeWidth,
            strokeDasharray: look.dashArray,
            '--wf-edge-opacity': look.opacity,
            '--wf-edge-hover-opacity': look.hoverOpacity,
          } as CSSProperties
        }
        className={`wf-edge-path${look.animated ? ' wf-edge-live' : ''}`}
      />
      {style.showSourcePortLabel || edgeData.iterationLabel ? (
        <EdgeLabelRenderer>
          <div
            // The iteration badge alone takes pointer events (and a
            // `title`) — the phase doc's "the bounds on hover" — a plain
            // port-label chip has nothing further to reveal, so it stays
            // `pointer-events-none` like every other edge decoration.
            title={edgeData.iterationLabel ? loopBoundsTitle(edgeData.edge) : undefined}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              opacity: state === 'dead' ? DEAD_EDGE_OPACITY : 1,
            }}
            className={`rounded bg-card px-1 py-0.5 text-[9px] font-medium text-muted-foreground shadow-sm ${edgeData.iterationLabel ? '' : 'pointer-events-none'}`}
          >
            {edgeData.iterationLabel ?? edgeData.edge.fromPort}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const WORKFLOW_EDGE_TYPES = { workflowEdge: WorkflowEdgeView };
