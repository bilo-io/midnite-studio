import type { KnowledgeGraphLink, KnowledgeGraphNode } from '@midnite/studio-shared';

/**
 * The detail budget — how much of a large graph the canvas mounts up front.
 *
 * Measured on this repo's own graph (15,292 nodes / 37,036 links) in the
 * packaged app: mounting everything into sigma costs every later operation
 * proportionally — a full re-index (`sigma.refresh()` with no partial graph,
 * which re-runs both reducers over every item) is ~27 ms, the intro burst
 * re-indexes on every frame, and a Constellation frame uploads 12 vertices
 * for each of 37k edges. The graph is also *unreadable* at that density: the
 * default `calls`-only relation filter already hides 83% of the edges, and
 * nine in ten nodes have fewer than ten edges. So the canvas opens on the
 * **core** — the highest-degree nodes and the links among them — and pulls
 * more in on demand (search, a tree click, expanding a cluster), rather than
 * paying for 15k nodes to draw a picture that reads as a hairball.
 *
 * Ranking is by degree over ALL links (`knowledge-degree.ts`'s
 * `computeDegrees`, the same number node size already comes from), ties
 * broken by id so the same graph always yields the same core. Counted at
 * each level for this repo:
 *
 *   | level    | nodes  | links among them |
 *   |----------|--------|------------------|
 *   | core     |  1,500 |  8,618           |
 *   | extended |  5,000 | 22,463           |
 *   | all      | 15,292 | 37,036           |
 *
 * Pure — vitest-covered in `knowledge-detail.test.ts` with no canvas.
 */
export type KnowledgeDetailId = string;

export type KnowledgeDetailLevel = {
  id: KnowledgeDetailId;
  label: string;
  /** Upper bound on mounted nodes; `Infinity` mounts the whole graph. */
  maxNodes: number;
};

export const DETAIL_LEVELS: readonly KnowledgeDetailLevel[] = [
  { id: 'core', label: 'Core', maxNodes: 1_500 },
  { id: 'extended', label: 'Extended', maxNodes: 5_000 },
  { id: 'all', label: 'Everything', maxNodes: Number.POSITIVE_INFINITY },
];

export const DEFAULT_DETAIL_ID: KnowledgeDetailId = DETAIL_LEVELS[0]!.id;

/** An unknown or removed id (a stale persisted value) falls back to the default — the same rule `resolveVariant` follows. */
export function resolveDetailLevel(id: KnowledgeDetailId): KnowledgeDetailLevel {
  return DETAIL_LEVELS.find((level) => level.id === id) ?? DETAIL_LEVELS[0]!;
}

/**
 * The levels worth offering for a graph of `nodeCount` nodes: every level
 * whose budget is below the count, plus the first one that fits everything.
 * A graph that fits the smallest budget yields one level — nothing to
 * choose, so the pill row is not rendered at all.
 */
export function offeredDetailLevels(nodeCount: number): readonly KnowledgeDetailLevel[] {
  const out: KnowledgeDetailLevel[] = [];
  for (const level of DETAIL_LEVELS) {
    out.push(level);
    if (level.maxNodes >= nodeCount) break;
  }
  return out;
}

/** How many nodes `level` actually mounts for a graph of `nodeCount` nodes. */
export function mountedNodeCount(nodeCount: number, level: KnowledgeDetailLevel): number {
  return Math.min(nodeCount, level.maxNodes);
}

/** `1500` → `1.5k`, `15292` → `15.3k`, `840` → `840` — the pill labels. */
export function formatNodeCount(count: number): string {
  if (count < 1_000) return String(count);
  const thousands = count / 1_000;
  return `${thousands >= 100 ? Math.round(thousands) : thousands.toFixed(1).replace(/\.0$/, '')}k`;
}

/** Degree descending, then id ascending — deterministic for a given graph. */
export function rankNodesByDegree<T extends Pick<KnowledgeGraphNode, 'id'>>(
  nodes: readonly T[],
  degrees: ReadonlyMap<string, number>,
): T[] {
  return [...nodes].sort(
    (a, b) =>
      (degrees.get(b.id) ?? 0) - (degrees.get(a.id) ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/**
 * The ids inside the budget — the top `maxNodes` by degree. `null` when the
 * whole graph fits, so a caller can skip its filtering pass entirely rather
 * than copying 15k ids into a set to test every one of them against it.
 */
export function selectCoreNodeIds(
  nodes: readonly Pick<KnowledgeGraphNode, 'id'>[],
  degrees: ReadonlyMap<string, number>,
  maxNodes: number,
): ReadonlySet<string> | null {
  if (nodes.length <= maxNodes) return null;
  const ranked = rankNodesByDegree(nodes, degrees);
  return new Set(ranked.slice(0, maxNodes).map((node) => node.id));
}

/**
 * Link indices by endpoint — built once per payload so revealing a node can
 * find its incident links in O(degree) instead of a pass over all 37k.
 */
export function linkIndexByNode(
  links: readonly Pick<KnowledgeGraphLink, 'source' | 'target'>[],
): ReadonlyMap<string, number[]> {
  const index = new Map<string, number[]>();
  const push = (id: string, i: number): void => {
    const list = index.get(id);
    if (list) list.push(i);
    else index.set(id, [i]);
  };
  for (let i = 0; i < links.length; i++) {
    const link = links[i]!;
    push(link.source, i);
    if (link.target !== link.source) push(link.target, i);
  }
  return index;
}

/** How many search matches a query reveals onto a budgeted canvas — the highest-degree ones first; the rest stay reachable through the tree list. */
export const MAX_SEARCH_REVEAL = 200;

/** How many neighbours come along when a focused node is revealed — enough context to read its place in the graph, bounded so a hub cannot drag half the graph in. */
export const MAX_FOCUS_NEIGHBOURS = 400;
