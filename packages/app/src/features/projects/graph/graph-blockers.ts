import type { ForgeGraph, ForgeGraphNode, ForgeIssueRef } from '@midnite/studio-shared';

/**
 * The blockers that may legitimately gate `CardComposer`'s Start button for
 * one board item (Phase 75 Theme G) — every still-unmet `blocks` edge whose
 * `source` is `'api'` or `'field'`, and *only* those.
 *
 * **A `'body'`-sourced edge never appears here**, no matter how many of them
 * a node carries. That layer is the app's own inference from the issue's
 * prose rather than something GitHub (or the board's own field) asserted,
 * and the phase doc's own decision is that a wrong prose parse must never
 * lock a user out of their own card.
 *
 * **Node key, recomputed rather than carried on the node** — the identical
 * scheme `graph-layout.ts`'s own `nodeKey` uses (Theme B never stores a key
 * on `ForgeGraphNode` itself): `itemId` for a draft, `` `${repo}#${number}` ``
 * for everything else, exactly how `resolveForgeGraph` minted
 * `ForgeGraphEdge.from`/`.to` in the first place.
 */
function nodeKey(node: ForgeGraphNode): string {
  return node.kind === 'draft' ? node.itemId : `${node.repo}#${node.number}`;
}

export function apiFieldBlockersFor(graph: ForgeGraph, itemId: string): ForgeIssueRef[] {
  const node = graph.nodes.find((n) => n.itemId === itemId);
  if (!node) return [];
  const key = nodeKey(node);
  const nodeByKey = new Map(graph.nodes.map((n) => [nodeKey(n), n]));

  const refs: ForgeIssueRef[] = [];
  for (const edge of graph.edges) {
    if (edge.kind !== 'blocks' || edge.from !== key) continue;
    if (edge.source !== 'api' && edge.source !== 'field') continue;
    const blocker = nodeByKey.get(edge.to);
    // Closed (met) or numberless (nothing to name in the title) — either way
    // this edge contributes nothing to the gate.
    if (!blocker || blocker.state === 'closed' || blocker.number === null) continue;
    refs.push({ repo: blocker.repo, number: blocker.number });
  }
  return refs;
}
