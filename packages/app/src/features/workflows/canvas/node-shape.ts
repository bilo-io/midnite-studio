import type { WorkflowNodeKind } from '@midnite/studio-shared';

/**
 * A node card's own silhouette, independent of `node-kind-meta.ts`'s
 * category hue (that tints; this shapes). One entry per
 * {@link WorkflowNodeKind} — a compile error here is what keeps this map
 * honest as later themes add kinds:
 *
 * - `card` — the plain rectangular card every kind starts from.
 * - `diamond-header` — a diamond accent ahead of the header label, for a
 *   node whose whole job is "which way does this branch" (`condition` now;
 *   Theme F's `router` reuses this exact variant, not a new one).
 * - `pill` — a narrow, fully-rounded shape with no header strip (`join`) —
 *   a routing decision has no config worth a body, just its mode.
 * - `shield` — the plain card, plus a small shield accent ahead of the
 *   header label (`gate`, Phase 97 Theme D) — the diamond accent's own
 *   "which way does this branch" role, worn by a human decision instead of
 *   a computed one.
 * - `check-badge` — a plain card whose header carries a small pass/fail
 *   badge showing the node's own last verdict (`verify`, Theme E) — unlike
 *   `diamond-header`/`pill`/`shield`, this variant's own content depends on
 *   run state, not just the node's config, so it reads
 *   `WorkflowNodeData.settledPort`.
 * - `start-card` — the plain card, left-rounded instead of square-cornered
 *   (`trigger`, Phase 97 Theme H) — a graph's own start has no in-port to
 *   dock a handle on, so the rounded edge reads as "nothing connects here."
 * - `frame` — a big bordered container sized from its own `config.width`/
 *   `height` rather than the fixed 200×64 every other variant uses, showing
 *   its six slots instead of a one-line summary; no ports (`frame` has none
 *   — see `portsForNode`). This was this map's own documented Theme I
 *   extension point, landing now.
 *
 * A new node kind adds one case to {@link WORKFLOW_NODE_KINDS} in
 * `shared/src/workflow.ts`, which makes this `Record` fail to typecheck
 * until it is widened with a shape variant. Each new variant is then given
 * its own rendering branch in `workflow-node-view.tsx` next to
 * `diamond-header`/`pill`/`shield`/`check-badge`/`start-card`/`frame` below
 * — this map only says *which* variant a kind gets, never how one is drawn.
 */
export type NodeShapeVariant =
  | 'card'
  | 'diamond-header'
  | 'pill'
  | 'shield'
  | 'check-badge'
  | 'start-card'
  | 'frame';

export const NODE_SHAPE: Record<WorkflowNodeKind, NodeShapeVariant> = {
  http: 'card',
  transform: 'card',
  condition: 'diamond-header',
  delay: 'card',
  note: 'card',
  agent: 'card',
  script: 'card',
  join: 'pill',
  gate: 'shield',
  /** Phase 97 Theme F — reuses `diamond-header` verbatim, per this map's own extension-point note above: "which way does this branch" is exactly what a router is too, just with more than two ways. */
  router: 'diamond-header',
  verify: 'check-badge',
  /** Phase 97 Theme H — see `'start-card'`'s own doc note above. */
  trigger: 'start-card',
  /** Phase 97 Theme G — the plain card: a `state` write has no "which way" or "waiting on a human" role worth its own accent. */
  state: 'card',
  /** Phase 97 Theme I — see `'frame'`'s own doc note above. */
  frame: 'frame',
  /** Phase 97 Theme I — the plain card: `policy` is a permission boundary, not a "which way does this branch" or "waiting on a human" role. */
  policy: 'card',
};
