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
 *
 * **Extension point for E/F/H/I** (documented on the phase doc's own
 * dependency list, not invented here): a new node kind adds one case to
 * {@link WORKFLOW_NODE_KINDS} in `shared/src/workflow.ts`, which makes this
 * `Record` fail to typecheck until it is widened with a shape variant —
 * `verify` → `'check-badge'`, `router` → reuse `'diamond-header'`,
 * `trigger` → `'start-card'`, `frame` → `'frame'`. Each new variant is then
 * given its own rendering branch in `workflow-node-view.tsx` next to
 * `diamond-header`/`pill`/`shield` below — this map only says *which*
 * variant a kind gets, never how one is drawn.
 */
export type NodeShapeVariant = 'card' | 'diamond-header' | 'pill' | 'shield';

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
};
