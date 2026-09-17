import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';

import type { LayoutPositions, LeanGraph } from './types';

/**
 * ForceAtlas2 settings tuned for a graph this dense (14,881 nodes / 36,032
 * links, verified against this repo's own graph). `barnesHutOptimize` is what
 * keeps a single iteration sub-quadratic — without it a full run over a graph
 * this size does not finish in a shippable amount of time. Every value here is
 * a fixed constant, not derived from `Math.random()` or wall-clock timing, so
 * two runs over the same input settle at the same coordinates (see
 * {@link seedDeterministicLayout}) — the cache is meaningful only if that
 * holds, and a visual regression baseline needs it to hold too.
 */
export const FORCE_ATLAS2_SETTINGS = {
  gravity: 1,
  scalingRatio: 25,
  barnesHutOptimize: true,
  barnesHutTheta: 0.6,
  slowDown: 1,
  strongGravityMode: false,
  outboundAttractionDistribution: true,
};

/**
 * Seed every node with a deterministic starting position before ForceAtlas2
 * runs. graphology-layout-forceatlas2 reads each node's current `x`/`y` as its
 * starting point, and leaves them at `0,0` (or whatever the graph already
 * carries) if nothing seeds them — which for a dense graph converges to a
 * degenerate, order-dependent tangle. Nodes are sorted by id (not left in
 * insertion order, which is `graph.json`'s file order and no more meaningful
 * than any other) so this is stable across two `readGraph` calls on the same
 * `graph.json`.
 */
export function seedDeterministicLayout(graph: Graph): void {
  const ids = graph.nodes().sort();
  const count = ids.length || 1;
  const radius = Math.sqrt(count) * 10;
  ids.forEach((id, index) => {
    const angle = (2 * Math.PI * index) / count;
    graph.setNodeAttribute(id, 'x', radius * Math.cos(angle));
    graph.setNodeAttribute(id, 'y', radius * Math.sin(angle));
  });
}

/** Build a graphology `Graph` from the lean projection — layout input only, discarded after. */
export function toGraphologyGraph(lean: LeanGraph): Graph {
  const graph = new Graph({ type: 'undirected', multi: true, allowSelfLoops: true });
  for (const node of lean.nodes) {
    if (!graph.hasNode(node.id)) graph.addNode(node.id);
  }
  for (const link of lean.links) {
    // A link may reference a node graphify pruned from `nodes[]` (e.g. an
    // external symbol) — skip rather than throw, matching this package's
    // "never throws" rule for anything that touches file-shaped input.
    if (!graph.hasNode(link.source) || !graph.hasNode(link.target)) continue;
    graph.addEdge(link.source, link.target, { weight: link.weight });
  }
  return graph;
}

export function extractPositions(graph: Graph): LayoutPositions {
  const positions: LayoutPositions = {};
  graph.forEachNode((id, attributes) => {
    positions[id] = { x: Number(attributes.x) || 0, y: Number(attributes.y) || 0 };
  });
  return positions;
}

/**
 * Run ForceAtlas2 over the full graph once, in fixed-size batches, reporting
 * progress after each batch — a multi-second pass over 14,881 nodes must not
 * be a single opaque await (Theme D needs something to show other than a
 * frozen empty canvas, and `layout-worker.ts` is what turns these callbacks
 * into `postMessage`s).
 */
export function runForceAtlas2(
  graph: Graph,
  totalIterations: number,
  batchSize: number,
  onProgress?: (done: number, total: number) => void,
): void {
  seedDeterministicLayout(graph);
  let done = 0;
  while (done < totalIterations) {
    const step = Math.min(batchSize, totalIterations - done);
    forceAtlas2.assign(graph, { iterations: step, settings: FORCE_ATLAS2_SETTINGS });
    done += step;
    onProgress?.(done, totalIterations);
  }
}

/** Compute deterministic layout positions for a lean graph, in one call — the test-facing entry point. */
export function layoutGraph(
  lean: LeanGraph,
  options: { totalIterations?: number; batchSize?: number } = {},
): LayoutPositions {
  const totalIterations = options.totalIterations ?? 100;
  const batchSize = options.batchSize ?? 25;
  const graph = toGraphologyGraph(lean);
  runForceAtlas2(graph, totalIterations, batchSize);
  return extractPositions(graph);
}
