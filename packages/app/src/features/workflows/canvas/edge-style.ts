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

/** A dead edge's opacity — the phase doc's own "35%" number, named once so the edge component and its test share it. */
export const DEAD_EDGE_OPACITY = 0.35;

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
