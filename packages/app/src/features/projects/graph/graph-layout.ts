import type { ForgeGraph, ForgeGraphEdge, ForgeGraphNode } from '@midnite/studio-shared';

import type { Viewport } from '../../workflows/canvas/workflow-geometry';
import type { Rect } from '../../workflows/canvas/workflow-path';

export type { Rect } from '../../workflows/canvas/workflow-path';

/**
 * Ranks a dependency graph left-to-right with blockers upstream, and packs
 * disconnected components so their bounding boxes never overlap — the
 * crib's `dagre` (`rankdir: 'LR'`), replaced with ~40 lines of longest-path
 * ranking plus a two-sweep barycentre for within-rank order, because that
 * dependency was declined at ~90KB for what this file does. Pure: same
 * `ForgeGraph` in, same layout out, no DOM, no store, testable without
 * mounting anything — the same argument `workflow-path.ts` makes for its
 * own arithmetic.
 *
 * **Node key**, recomputed here rather than carried on `ForgeGraphNode`
 * (Theme B never stores it on the node itself): `itemId` for a draft,
 * `` `${repo}#${number}` `` for everything else — exactly the scheme
 * `resolveForgeGraph` used to mint `ForgeGraphEdge.from`/`.to`, so a node's
 * recomputed key always matches the edges that reference it.
 */

export interface ForgeGraphGeometry {
  readonly width: number;
  readonly height: number;
  readonly rankGap: number;
  readonly nodeGap: number;
}

/** Numbers that move together, out of JSX and out of the arithmetic below —
 *  the same move `workflow-geometry.ts` makes for the workflow canvas. */
export const FORGE_GRAPH_GEOMETRY: ForgeGraphGeometry = {
  width: 200,
  height: 64,
  rankGap: 96,
  nodeGap: 20,
} as const;

export type PositionedNode = ForgeGraphNode & { key: string; x: number; y: number; rank: number };

/**
 * An edge, positioned only in the sense that it belongs to the laid-out
 * graph this module produces — `from`/`to` are already node keys (Theme B),
 * so there is nothing else to add here. A distinct name from
 * `ForgeGraphEdge` rather than a bare re-export because Theme D's props read
 * as "the edges this canvas is showing", not "the edges the resolver found".
 */
export type PositionedEdge = ForgeGraphEdge;

export interface ForgeGraphLayout {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  bounds: Rect;
}

const SOURCE_PRECEDENCE: Record<ForgeGraphEdge['source'], number> = { api: 3, field: 2, body: 1 };

const EMPTY_BOUNDS: Rect = { x: 0, y: 0, width: 0, height: 0 };

function nodeKey(node: ForgeGraphNode): string {
  return node.kind === 'draft' ? node.itemId : `${node.repo}#${node.number}`;
}

/** Both directions of every edge — 'blocks' and 'contains' alike — used for
 *  component discovery and within-rank ordering, neither of which cares
 *  which end is the dependent. */
function buildNeighbors(edges: readonly ForgeGraphEdge[]): Map<string, string[]> {
  const neighbors = new Map<string, string[]>();
  const add = (a: string, b: string) => {
    const list = neighbors.get(a);
    if (list) list.push(b);
    else neighbors.set(a, [b]);
  };
  for (const edge of edges) {
    add(edge.from, edge.to);
    add(edge.to, edge.from);
  }
  return neighbors;
}

/**
 * The ranking DAG: `'blocks'` edges only, with the lower-precedence half of
 * each mutual pair dropped (`body` < `field` < `api`; a tie drops the edge
 * whose `from` key sorts later). Both edges of a mutual pair still render —
 * this map only decides which one counts toward rank.
 */
function buildBlockersOf(edges: readonly ForgeGraphEdge[]): Map<string, string[]> {
  const blocksEdges = edges.filter((edge) => edge.kind === 'blocks');
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const byPair = new Map<string, ForgeGraphEdge[]>();
  for (const edge of blocksEdges) {
    const key = pairKey(edge.from, edge.to);
    const existing = byPair.get(key);
    if (existing) existing.push(edge);
    else byPair.set(key, [edge]);
  }

  const blockersOf = new Map<string, string[]>();
  for (const pair of byPair.values()) {
    let kept: ForgeGraphEdge;
    if (pair.length === 1) {
      kept = pair[0]!;
    } else {
      const a = pair[0]!;
      const b = pair[1]!;
      const precedenceA = SOURCE_PRECEDENCE[a.source];
      const precedenceB = SOURCE_PRECEDENCE[b.source];
      kept = precedenceA !== precedenceB ? (precedenceA > precedenceB ? a : b) : a.from < b.from ? a : b;
    }
    const list = blockersOf.get(kept.from);
    if (list) list.push(kept.to);
    else blockersOf.set(kept.from, [kept.to]);
  }
  return blockersOf;
}

/**
 * Longest-path rank, memoised. A node's rank is one past its deepest
 * blocker; a node with none is rank 0. `inProgress` guards against any
 * cycle the mutual-pair rule above did not already resolve (a cycle longer
 * than two nodes is not something the doc's own cycle rule covers) — belt,
 * not just braces, since board data is outside this phase's control and
 * this function must never hang.
 */
function computeRanks(keys: readonly string[], blockersOf: ReadonlyMap<string, string[]>): Map<string, number> {
  const rank = new Map<string, number>();
  const inProgress = new Set<string>();

  function rankOf(key: string): number {
    const cached = rank.get(key);
    if (cached !== undefined) return cached;
    if (inProgress.has(key)) return 0;
    inProgress.add(key);
    let deepest = 0;
    for (const blocker of blockersOf.get(key) ?? []) {
      deepest = Math.max(deepest, rankOf(blocker) + 1);
    }
    inProgress.delete(key);
    rank.set(key, deepest);
    return deepest;
  }

  for (const key of keys) rankOf(key);
  return rank;
}

/** Connected components over the undirected adjacency, so two unrelated
 *  parts of the board never share a bounding box. */
function computeComponents(keys: readonly string[], neighbors: ReadonlyMap<string, string[]>): Map<string, number> {
  const componentOf = new Map<string, number>();
  let next = 0;
  for (const start of keys) {
    if (componentOf.has(start)) continue;
    const stack = [start];
    componentOf.set(start, next);
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const neighbor of neighbors.get(current) ?? []) {
        if (!componentOf.has(neighbor)) {
          componentOf.set(neighbor, next);
          stack.push(neighbor);
        }
      }
    }
    next += 1;
  }
  return componentOf;
}

/** Barycentre reorder of one rank's row against an already-ordered adjacent
 *  row. A node with no neighbours in that row keeps its board-order
 *  position as the barycentre — a fallback, never a special case the sort
 *  has to know about. */
function reorderRank(
  row: string[],
  adjacentRow: readonly string[],
  neighbors: ReadonlyMap<string, string[]>,
  boardOrder: ReadonlyMap<string, number>,
): void {
  const adjacentPosition = new Map<string, number>();
  adjacentRow.forEach((key, index) => adjacentPosition.set(key, index));

  const barycentre = new Map<string, number>();
  for (const key of row) {
    const connected = (neighbors.get(key) ?? []).filter((neighbor) => adjacentPosition.has(neighbor));
    if (connected.length === 0) {
      barycentre.set(key, boardOrder.get(key)!);
      continue;
    }
    const sum = connected.reduce((total, neighbor) => total + adjacentPosition.get(neighbor)!, 0);
    barycentre.set(key, sum / connected.length);
  }

  row.sort((a, b) => barycentre.get(a)! - barycentre.get(b)! || boardOrder.get(a)! - boardOrder.get(b)!);
}

/**
 * Ranks `graph` left-to-right over `'blocks'` edges (blockers upstream,
 * `'contains'` never affecting rank), orders each rank by a two-sweep
 * barycentre, and packs disconnected components so their bounding boxes
 * never overlap. Deterministic: two calls over one graph return identical
 * positions.
 */
export function layoutForgeGraph(graph: ForgeGraph, geometry: ForgeGraphGeometry = FORGE_GRAPH_GEOMETRY): ForgeGraphLayout {
  if (graph.nodes.length === 0) {
    return { nodes: [], edges: [], bounds: EMPTY_BOUNDS };
  }

  const keyByNode = new Map<ForgeGraphNode, string>();
  const boardOrder = new Map<string, number>();
  const keys: string[] = [];
  graph.nodes.forEach((node, index) => {
    const key = nodeKey(node);
    keyByNode.set(node, key);
    boardOrder.set(key, index);
    keys.push(key);
  });

  const neighbors = buildNeighbors(graph.edges);
  const blockersOf = buildBlockersOf(graph.edges);
  const rank = computeRanks(keys, blockersOf);
  const componentOf = computeComponents(keys, neighbors);

  const componentCount = new Set(componentOf.values()).size;
  const componentFirstIndex = new Array<number>(componentCount).fill(Number.POSITIVE_INFINITY);
  for (const key of keys) {
    const component = componentOf.get(key)!;
    const index = boardOrder.get(key)!;
    if (index < componentFirstIndex[component]!) componentFirstIndex[component] = index;
  }
  const componentOrder = [...componentFirstIndex.keys()].sort(
    (a, b) => componentFirstIndex[a]! - componentFirstIndex[b]!,
  );

  const positions = new Map<string, { x: number; y: number }>();
  let yCursor = 0;

  for (const component of componentOrder) {
    const componentKeys = keys.filter((key) => componentOf.get(key) === component);
    const maxRank = Math.max(...componentKeys.map((key) => rank.get(key)!));
    const ranks: string[][] = Array.from({ length: maxRank + 1 }, () => []);
    for (const key of componentKeys) ranks[rank.get(key)!]!.push(key);
    for (const row of ranks) row.sort((a, b) => boardOrder.get(a)! - boardOrder.get(b)!);

    for (let r = 1; r <= maxRank; r++) reorderRank(ranks[r]!, ranks[r - 1]!, neighbors, boardOrder);
    for (let r = maxRank - 1; r >= 0; r--) reorderRank(ranks[r]!, ranks[r + 1]!, neighbors, boardOrder);

    const rowCount = Math.max(...ranks.map((row) => row.length));
    const componentHeight = rowCount * geometry.height + Math.max(0, rowCount - 1) * geometry.nodeGap;

    for (const row of ranks) {
      row.forEach((key, index) => {
        positions.set(key, {
          x: rank.get(key)! * (geometry.width + geometry.rankGap),
          y: yCursor + index * (geometry.height + geometry.nodeGap),
        });
      });
    }
    yCursor += componentHeight + geometry.nodeGap;
  }

  const positionedNodes: PositionedNode[] = graph.nodes.map((node) => {
    const key = keyByNode.get(node)!;
    const position = positions.get(key)!;
    return { ...node, key, x: position.x, y: position.y, rank: rank.get(key)! };
  });

  const maxX = Math.max(...positionedNodes.map((node) => node.x)) + geometry.width;
  const maxY = Math.max(...positionedNodes.map((node) => node.y)) + geometry.height;

  return {
    nodes: positionedNodes,
    edges: graph.edges,
    bounds: { x: 0, y: 0, width: maxX, height: maxY },
  };
}

/**
 * Fits `bounds` into a canvas `width` px wide at `zoom`, `padding` px clear
 * on every side — ported from the crib for its stated reason: centering a
 * graph taller than the canvas wastes a band at the top and clips the
 * bottom. **Top-aligned unconditionally** (never centred vertically, no
 * matter how the graph's height compares to the canvas, which is why this
 * function takes no canvas height at all); horizontally centred when the
 * content plus padding on both sides fits within `width`, else left-aligned
 * with exactly `padding` clear on the left. Returns `workflow-geometry.ts`'s
 * `Viewport` shape so `panBy`/`zoomAtPointer` consume it unchanged.
 */
export function topAlignedViewport(bounds: Rect, width: number, zoom: number, padding: number): Viewport {
  const scaledWidth = bounds.width * zoom;
  const fitsHorizontally = scaledWidth + padding * 2 <= width;
  const x = fitsHorizontally ? bounds.x - (width / zoom - bounds.width) / 2 : bounds.x - padding / zoom;
  const y = bounds.y - padding / zoom;
  return { x, y, scale: zoom };
}
