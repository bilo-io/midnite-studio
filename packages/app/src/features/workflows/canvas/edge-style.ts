import {
  normalizeEdge,
  WORKFLOW_ERROR_PORT_ID,
  type WorkflowEdge,
  type WorkflowEdgeKind,
  type WorkflowLoopState,
  type WorkflowNode,
  type WorkflowNodeStatus,
  type WorkflowPortType,
} from '@midnite/studio-shared';

import { activityStatusVar } from '../../activity/activity-status-color';

/**
 * A port handle's own colour, keyed by {@link WorkflowPortType}
 * (`shared/src/workflow.ts`'s `WORKFLOW_PORT_TYPES`) — the phase doc's
 * `--port-json|text|number|boolean|verdict|artifact` tokens (`styles.css`),
 * wrapped in `hsl(...)` at this one usage site, the same convention
 * `workflow-node-view.tsx`'s `CATEGORY_VAR` already follows for the node
 * category hues. `'any'` is the wildcard type and gets no dedicated token —
 * it falls back to `--border`, the same neutral an un-typed handle already
 * wore before this theme. `'artifact-ref'` reads the `artifact` token: the
 * port type carries a `-ref` suffix the CSS custom property does not.
 */
export const PORT_TYPE_COLOR_VAR: Record<WorkflowPortType, string> = {
  any: 'hsl(var(--border))',
  json: 'hsl(var(--port-json))',
  text: 'hsl(var(--port-text))',
  number: 'hsl(var(--port-number))',
  boolean: 'hsl(var(--port-boolean))',
  verdict: 'hsl(var(--port-verdict))',
  'artifact-ref': 'hsl(var(--port-artifact))',
};

/** One edge kind's stroke recipe — the custom edge component's whole style surface. */
export type EdgeKindStyle = {
  /** SVG `stroke-dasharray`; `undefined` for a solid line. */
  dashArray?: string;
  /** `true` shows the source port's own label as a small chip at the edge's start. */
  showSourcePortLabel?: boolean;
  /** `true` routes the edge as a curved back-edge drawn under node bodies, with an iteration badge. */
  isBackEdge?: boolean;
  /** A fixed stroke colour overriding the taken/dead/pending palette below (the `error` kind's failed-status red). */
  strokeColorVar?: string;
};

/**
 * Edge style per kind (phase doc §J): `data` solid, `conditional` solid plus
 * the source port's label, `error` dashed in the `failed` status colour,
 * `loop` dashed and drawn as a curved back-edge with an iteration badge.
 * Exhaustive over {@link WorkflowEdgeKind} so a fifth kind is a compile
 * error here until this map is widened on purpose.
 */
export const EDGE_KIND_STYLE: Record<WorkflowEdgeKind, EdgeKindStyle> = {
  data: {},
  conditional: { showSourcePortLabel: true },
  error: { dashArray: '4 3', strokeColorVar: activityStatusVar('failed') },
  loop: { dashArray: '4 3', isBackEdge: true },
};

/** Whether an edge was actually followed, resolved per edge — the taken/dead/pending vocabulary the canvas paints after a run. */
export type RendererEdgeState = 'taken' | 'dead' | 'pending';

/**
 * The canvas's own read of {@link RendererEdgeState} — a pure port of
 * `workflow-engine.ts`'s private `edgeState` (Phase 97 Theme B). Duplicated
 * rather than imported because `packages/app` may not import
 * `packages/desktop` (the package-boundary rule in `CLAUDE.md`): the
 * renderer only ever has a run's `WorkflowNodeStatus`/`settledPort` per
 * node, never the engine's own module, so it re-derives the same three-way
 * read from that data. Keep this in sync with the engine's `edgeState` if
 * that function's logic ever changes — the two must never disagree about
 * what "taken" means.
 *
 * `sourceSettledPort === undefined` on a terminal, non-skipped source is the
 * legacy-cascade case: a failed/timed-out node with no wired error edge
 * settles on nothing routable, so every one of its outgoing edges is dead.
 */
export function rendererEdgeState(
  edge: WorkflowEdge,
  sourceStatus: WorkflowNodeStatus | undefined,
  sourceSettledPort: string | undefined,
): RendererEdgeState {
  if (sourceStatus === undefined || sourceStatus === 'pending' || sourceStatus === 'running') {
    return 'pending';
  }
  if (sourceStatus === 'skipped') return 'dead';
  if (sourceSettledPort === undefined) return 'dead';
  return normalizeEdge(edge).fromPort === sourceSettledPort ? 'taken' : 'dead';
}

/**
 * The floor and ceiling every edge's stroke opacity is held to. Below 50% an
 * edge on the dark canvas all but disappears (the pre-clamp canvas drew every
 * edge in `--border` — itself a low-contrast token — so even "full opacity"
 * was faint); above 90% a crossing of several edges reads as one solid
 * block. {@link edgeAppearance} is the only place an edge opacity is
 * produced, and it passes every value through {@link clampEdgeOpacity}.
 */
export const EDGE_OPACITY_MIN = 0.5;
export const EDGE_OPACITY_MAX = 0.9;

/** Holds `value` inside [{@link EDGE_OPACITY_MIN}, {@link EDGE_OPACITY_MAX}]. `NaN` reads as the floor, never as an invisible edge. */
export function clampEdgeOpacity(value: number): number {
  if (Number.isNaN(value)) return EDGE_OPACITY_MIN;
  return Math.min(EDGE_OPACITY_MAX, Math.max(EDGE_OPACITY_MIN, value));
}

/**
 * A dead edge's opacity. The phase doc asked for 35%; the edge-visibility
 * pass lifted every edge to at least {@link EDGE_OPACITY_MIN}, so a dead
 * edge now sits AT the floor and reads as dead by losing its colour and its
 * marching dashes, not by near-vanishing.
 */
export const DEAD_EDGE_OPACITY = EDGE_OPACITY_MIN;

/**
 * Every variant an edge can be drawn in, orthogonal to its kind. `hovered`
 * never reaches this function as a boolean — the pointer's hover is CSS
 * (`.react-flow__edge:hover`, `styles.css`) — so its opacity is precomputed
 * here as `hoverOpacity` and handed to CSS through a custom property,
 * keeping the clamp in this one place.
 */
export type EdgeVariantInput = {
  kind: WorkflowEdgeKind;
  state: RendererEdgeState;
  /** The source node is mid-run — the edge is about to carry data. */
  running: boolean;
  selected: boolean;
};

export type EdgeAppearance = {
  stroke: string;
  strokeWidth: number;
  /** Already clamped. */
  opacity: number;
  /** Already clamped — applied by CSS while the pointer is over the edge. */
  hoverOpacity: number;
  dashArray?: string;
  /** Whether the marching-dash `.wf-edge-live` animation runs. */
  animated: boolean;
};

/** The resting edge colour: a real foreground tone rather than `--border`, so opacity — not a faint token — is what sets how strong an edge reads. */
const EDGE_STROKE = 'hsl(var(--muted-foreground))';
const EDGE_STROKE_SELECTED = 'hsl(var(--primary))';

/** Raw (pre-clamp) opacities per variant, strongest wins. */
const EDGE_OPACITY = {
  rest: 0.6,
  taken: 0.8,
  running: 0.85,
  error: 0.7,
  selected: 0.9,
  hoverBoost: 0.2,
} as const;

/** Stroke width, px: 2 at rest (1.5 was lost on the dark canvas even at full opacity), 2.5 selected. */
export const EDGE_STROKE_WIDTH = 2;
export const EDGE_STROKE_WIDTH_SELECTED = 2.5;

/**
 * An edge's whole visual recipe for one render — the only function that
 * decides an edge's opacity, and the one that clamps it. Kind supplies the
 * dash pattern and (for `error`) a fixed colour; state/running/selected pick
 * the opacity and width.
 */
export function edgeAppearance({ kind, state, running, selected }: EdgeVariantInput): EdgeAppearance {
  const kindStyle = EDGE_KIND_STYLE[kind];
  const stroke = selected
    ? EDGE_STROKE_SELECTED
    : state === 'dead'
      ? EDGE_STROKE
      : running
        ? activityStatusVar('running')
        : (kindStyle.strokeColorVar ?? EDGE_STROKE);

  const raw = selected
    ? EDGE_OPACITY.selected
    : state === 'dead'
      ? DEAD_EDGE_OPACITY
      : running
        ? EDGE_OPACITY.running
        : state === 'taken'
          ? EDGE_OPACITY.taken
          : kind === 'error'
            ? EDGE_OPACITY.error
            : EDGE_OPACITY.rest;

  const opacity = clampEdgeOpacity(raw);
  return {
    stroke,
    strokeWidth: selected ? EDGE_STROKE_WIDTH_SELECTED : EDGE_STROKE_WIDTH,
    opacity,
    hoverOpacity: clampEdgeOpacity(opacity + EDGE_OPACITY.hoverBoost),
    dashArray: kindStyle.dashArray,
    // Every edge animates until a run marks it dead — see
    // `workflow-edge-view.tsx` for the history of that rule.
    animated: state !== 'dead',
  };
}

/**
 * What kind a **new** connect-drag edge should carry, from the source port
 * it was drawn off — the canvas's own inverse of `migrateWorkflowEdges`'s
 * legacy read (`fromPort 'true'` on a `condition` source implies
 * `kind: 'conditional'`). Extension point for D/F: a `gate`/`router` node
 * also settles on a named, non-`error` out-port, so a future kind added here
 * reuses the `'conditional'` branch rather than growing a third named
 * category — "this edge is chosen by a routing decision" is the same fact
 * for a `condition`, a `gate` and a `router`.
 */
export function inferEdgeKind(fromNode: WorkflowNode, fromPortId: string): WorkflowEdgeKind {
  if (fromPortId === WORKFLOW_ERROR_PORT_ID) return 'error';
  // Theme F: a `router`'s out-ports are exactly its declared cases plus
  // `default` — the same "named branch, not a bare `out`" shape a
  // `condition`'s `true`/`false` has, so its edges read the same way.
  if (fromNode.kind === 'condition' || fromNode.kind === 'router') return 'conditional';
  return 'data';
}

/**
 * A `loop` edge's `n/max` badge (Theme C's `WorkflowLoopState`/
 * `WorkflowEdge.loop.maxIterations`) — `undefined` for anything that isn't a
 * `loop` edge, or one no run has reached yet. `maxIterations` absent (a
 * schema-invalid edge `validateWorkflow` already flags on its own) shows the
 * bare iteration count rather than inventing a bound.
 */
export function iterationLabelFor(
  edge: WorkflowEdge,
  loopStates: ReadonlyMap<string, WorkflowLoopState> | undefined,
): string | undefined {
  if ((edge.kind ?? 'data') !== 'loop') return undefined;
  const state = loopStates?.get(edge.id);
  if (!state) return undefined;
  return edge.loop ? `${state.iteration}/${edge.loop.maxIterations}` : `${state.iteration}`;
}

/** The iteration badge's hover text (the phase doc's "the bounds on hover") — the loop's own bound, spelled out rather than left to the bare `n/max` the badge shows. */
export function loopBoundsTitle(edge: WorkflowEdge): string | undefined {
  if (!edge.loop) return undefined;
  const minutes = Math.round(edge.loop.budgetMs / 60_000);
  return `Up to ${edge.loop.maxIterations} iterations, ${minutes >= 1 ? `${minutes}m` : `${edge.loop.budgetMs}ms`} budget.`;
}
