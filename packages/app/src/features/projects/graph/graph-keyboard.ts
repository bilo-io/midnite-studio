import type { PositionedEdge, PositionedNode } from './graph-layout';

/**
 * Pure keyboard arithmetic for the dependency graph (Phase 75 Theme D) —
 * `board-keyboard.ts`'s own `BoardColumn` model is a 2-D column/row grid that
 * cannot describe free-positioned nodes, so this is a new module rather than
 * a widened one (`board-keyboard.ts` stays untouched).
 *
 * Walking the graph *is* the view's purpose, so the keyboard follows edges
 * rather than screen position: **Left** goes to a blocker, **Right** to a
 * dependent — the same "blockers upstream" reading the layout itself uses.
 * **Up/Down** move among same-rank siblings, in the layout's own row order
 * (which `graph-layout.ts`'s barycentre sweep already settled).
 */

/** Left → a blocker (the `to` of a `blocks` edge whose `from` is this node).
 *  Right → a dependent (the `from` of a `blocks` edge whose `to` is this
 *  node). Among several candidates, the nearest rank wins; a further tie
 *  (two candidates at the same rank) breaks on the target's own key, so two
 *  runs over one graph always pick the same neighbour. `null` at a source
 *  (no blockers) or a sink (nothing depends on it). */
export function moveAlongEdge(
  nodes: readonly PositionedNode[],
  edges: readonly PositionedEdge[],
  fromKey: string,
  direction: 'left' | 'right',
): string | null {
  const rankByKey = new Map(nodes.map((node) => [node.key, node.rank]));
  const candidates =
    direction === 'left'
      ? edges.filter((edge) => edge.kind === 'blocks' && edge.from === fromKey).map((edge) => edge.to)
      : edges.filter((edge) => edge.kind === 'blocks' && edge.to === fromKey).map((edge) => edge.from);

  if (candidates.length === 0) return null;

  let best: string | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const key of candidates) {
    const rank = rankByKey.get(key);
    if (rank === undefined) continue;
    if (best === null || rank < bestRank || (rank === bestRank && key < best)) {
      best = key;
      bestRank = rank;
    }
  }
  return best;
}

/** Up/Down among same-rank siblings, in the layout's own row order (`y`
 *  ascending) — wraps at either end rather than stopping, since a rank's
 *  row is a closed loop of siblings, not a list with edges of its own. */
export function moveWithinRank(nodes: readonly PositionedNode[], fromKey: string, delta: 1 | -1): string | null {
  const from = nodes.find((node) => node.key === fromKey);
  if (!from) return null;

  const siblings = nodes.filter((node) => node.rank === from.rank).sort((a, b) => a.y - b.y);
  if (siblings.length <= 1) return null;

  const index = siblings.findIndex((node) => node.key === fromKey);
  if (index === -1) return null;

  const nextIndex = (index + delta + siblings.length) % siblings.length;
  return siblings[nextIndex]!.key;
}
