import type { ForgeGraphEdge, ForgeGraphNode } from '@midnite/studio-shared';

import type { CardGlowState } from '../board/glow-state';
import type { StatusStroke } from '../status-stroke';

/**
 * The dependency graph's edge styling (Phase 75 Theme E) — a pure function
 * from the edge plus its two endpoints to a set of CSS classes and a stroke
 * width, so `styles-motion-guards.test.ts` and this module's own unit tests
 * cover every state with no DOM and no store.
 *
 * **Naming, inherited from the crib and stated once because it is the one
 * thing every other theme in this phase gets wrong if it guesses:** `source`
 * here is **the blocker**, `target` is **the dependent it feeds** — the
 * opposite of `ForgeGraphEdge.from`/`.to` for a `'blocks'` edge, where `from`
 * is the dependent and `to` is the blocker (`forge-graph.ts`'s own doc
 * comment). The caller (`project-graph-view.tsx`) is what reconciles the
 * two: it looks up `source` at `edge.to` and `target` at `edge.from`.
 *
 * The five blocking states, ported from `~/Dev/midnite`'s task graph:
 *
 * | blocker (source)      | dependent (target) | appearance                                |
 * |------------------------|---------------------|--------------------------------------------|
 * | closed                 | closed              | solid `--dep-done`, 2.5px                   |
 * | closed                 | ready               | animated dash, `--dep-done` + bloom         |
 * | closed                 | still blocked       | animated dash, `--dep-done`                 |
 * | open, agent running    | blocked             | animated dash, `--dep-active`               |
 * | otherwise              | —                   | static `--dep-idle`, 1.5px                  |
 *
 * **Deliberate extension over the phase doc's literal two-node signature:**
 * "agent running" is not a property `ForgeGraphNode` carries — it lives in
 * `useGraphAgentStates`' `CardGlowState` map, one level up. Rather than
 * leave the fourth row undecidable, this function takes `sourceGlow` as a
 * fourth, defaulted parameter: still pure (a plain value in, a plain value
 * out, no subscription of its own), and a foreign blocker — never a board
 * item, so never in the glow map — resolves to `'idle'` by the same default
 * and falls through to "otherwise", which is correct: a node nobody can
 * start an agent on is never "agent running".
 *
 * `'contains'` edges skip the table entirely — one quiet, never-animated
 * appearance regardless of either endpoint's state (Theme E's own rule: a
 * parent/child relationship is not a blocking one). A `source: 'body'` edge
 * — the app's own best-effort parse of an issue description — renders
 * dotted rather than dashed and at reduced opacity on top of whatever the
 * table above decided, because `resolveForgeGraph` only ever mints a `body`
 * edge with `kind: 'blocks'` (the containment layer is API-only), so the
 * two modifiers never have to agree on which wins.
 *
 * **Status stroke (ad hoc, over the table above).** When the blocker is a
 * board item with a Status value, the edge wears that status's colour and
 * dash, and marches when the status does — the same `StatusStroke` its card
 * border wears (`status-stroke.ts`), so the two never disagree. The table
 * above still decides the bloom. A `body` edge keeps its dotted pattern (it
 * is a guess, and dotted is how the graph says so) and takes only the
 * colour. A blocker with no status (a foreign node, or an item with no
 * Status value) falls back to the table above unchanged.
 */
export interface EdgeAppearance {
  className: string;
  strokeWidth: number;
  /** Inline paint from a status stroke; absent when the table's own classes paint the edge. */
  style?: { stroke: string; strokeDasharray?: string };
}

const CONTAINS: EdgeAppearance = { className: 'dep-edge dep-edge-contains', strokeWidth: 1.5 };
const IDLE: EdgeAppearance = { className: 'dep-edge dep-edge-idle', strokeWidth: 1.5 };
const DONE_SOLID: EdgeAppearance = { className: 'dep-edge dep-edge-done', strokeWidth: 2.5 };
const DONE_ANIMATED: EdgeAppearance = { className: 'dep-edge dep-edge-done dep-edge-animated', strokeWidth: 2 };
const DONE_BLOOM: EdgeAppearance = {
  className: 'dep-edge dep-edge-done dep-edge-animated dep-edge-bloom',
  strokeWidth: 2,
};
const ACTIVE: EdgeAppearance = { className: 'dep-edge dep-edge-active dep-edge-animated', strokeWidth: 2 };

/** Both live states — a question on screen is still work happening upstream,
 *  not a stall; only a completed run or nothing at all falls through to
 *  "otherwise". */
function isAgentRunning(glow: CardGlowState): boolean {
  return glow === 'running' || glow === 'waiting';
}

export function edgeAppearance(
  edge: ForgeGraphEdge,
  source: ForgeGraphNode,
  target: ForgeGraphNode,
  sourceGlow: CardGlowState = 'idle',
  sourceStatus: StatusStroke | null = null,
): EdgeAppearance {
  if (edge.kind === 'contains') return CONTAINS;

  let appearance: EdgeAppearance;
  if (source.state === 'closed') {
    if (target.state === 'closed') appearance = DONE_SOLID;
    else if (target.ready) appearance = DONE_BLOOM;
    else appearance = DONE_ANIMATED;
  } else if (source.state === 'open' && isAgentRunning(sourceGlow) && target.blocked) {
    appearance = ACTIVE;
  } else {
    appearance = IDLE;
  }

  const body = edge.source === 'body';

  if (sourceStatus) {
    const classes = ['dep-edge', 'dep-edge-status'];
    if (sourceStatus.animated && !body) classes.push('dep-edge-animated');
    if (appearance === DONE_BLOOM) classes.push('dep-edge-bloom');
    if (body) classes.push('dep-edge-body');
    return {
      className: classes.join(' '),
      strokeWidth: sourceStatus.width,
      style: body
        ? { stroke: sourceStatus.color }
        : { stroke: sourceStatus.color, strokeDasharray: sourceStatus.dashArray ?? 'none' },
    };
  }

  if (body) {
    appearance = { ...appearance, className: `${appearance.className} dep-edge-body` };
  }

  return appearance;
}
