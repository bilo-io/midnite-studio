import type { WorkflowNodeKind } from '@midnite/studio-shared';

/**
 * The visual family a node kind belongs to (Phase 95 Theme I, porting
 * midnite's `trigger|action|logic|data|storage` hue system —
 * `~/Dev/midnite/midnite/packages/ui/src/styles/tokens.css`).
 *
 * midnite has a sixth kind, `trigger` (one canonical, non-draggable trigger
 * per workflow); this app has none — every workflow here starts because
 * someone pressed Run, per `workflow.ts`'s own doc comment — so `trigger`
 * never appears in this map. The five kinds this app actually has:
 *
 * - `http` → **action**: it reaches out and does something to the world.
 * - `delay` → **action**: alongside `http`, it is a step that *does*
 *   something (waits), not one that reshapes or branches on data already in
 *   hand.
 * - `transform` → **data**: it reshapes the run's data, midnite's own
 *   category for that kind of node.
 * - `condition` → **logic**: it branches, midnite's own category for that
 *   kind of node.
 * - `note` → no category. A note is canvas furniture with no executor
 *   (`validateWorkflow`'s own rule: it cannot even be connected), so it
 *   never runs and never inherits a hue meant to say "this step does X" —
 *   `workflow-node-view.tsx` gives it a plain neutral header instead of
 *   reaching for `storage`, which midnite reserves for an actual
 *   credential/data-store node kind this app does not have.
 */
export type WorkflowNodeCategory = 'action' | 'logic' | 'data';

export const NODE_CATEGORY: Record<WorkflowNodeKind, WorkflowNodeCategory | null> = {
  http: 'action',
  delay: 'action',
  transform: 'data',
  condition: 'logic',
  note: null,
};

/** `var(--node-<category>)` — the header tint `workflow-node-view.tsx` paints with; `null` (note) means no tint. */
export function nodeCategoryVar(kind: WorkflowNodeKind): string | null {
  const category = NODE_CATEGORY[kind];
  return category ? `var(--node-${category})` : null;
}
