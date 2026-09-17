import Graph from 'graphology';
import circlepack from 'graphology-layout/circlepack';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import noverlap from 'graphology-layout-noverlap';

import type { LayoutPositions, LeanGraph } from './types';

/**
 * ForceAtlas2 settings tuned for a graph this dense (15,292 nodes / 37,036
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
 * Circlepack (Phase 89 Theme E) groups nodes into nested circles by
 * community — `graphology-layout`'s own `circlepack` module (MIT, same
 * `graphology` org as `graphology-layout-forceatlas2` already in use), which
 * reads `hierarchyAttributes` off each node's attributes (set by
 * {@link toGraphologyGraph}) and packs one circle per distinct value. `scale`
 * is a fixed constant that puts the packed circles in roughly the same
 * coordinate range ForceAtlas2's own output occupies (radius ~1,200 on this
 * repo's graph) — sigma auto-fits the camera to whatever the bounding box is,
 * so the exact number matters far less than it being a *constant*, not a
 * function of node count that would make the two layouts' scales diverge
 * unpredictably as the graph grows.
 */
export const CIRCLEPACK_SETTINGS = {
  hierarchyAttributes: ['community'],
  scale: 40,
};

/**
 * Noverlap's own tuning (Phase 89 Theme E) — a post-pass that nudges
 * overlapping circles apart, run here after a ForceAtlas2 pass (dense
 * clusters are exactly where ForceAtlas2 leaves nodes stacked). Bounded
 * `maxIterations` rather than the library's own 500-iteration default so a
 * "noverlap" layout request has a predictable cost next to the other three.
 */
export const NOVERLAP_SETTINGS = {
  maxIterations: 50,
  settings: {
    gridSize: 20,
    margin: 8,
    ratio: 1.05,
    speed: 3,
  },
};

/**
 * The "imports" and "imports_from" relations are the only two graphify edge
 * kinds that carry a dependency *direction* (source depends on / imports
 * target) — verified against this repo's own graph: 10,698 `imports` +
 * 6,141 `imports_from` out of 37,036 links, versus `contains`/`calls`/etc.,
 * which describe structure or runtime behaviour, not module dependency.
 * {@link runHierarchical} layers nodes by depth along these edges only.
 */
export const HIERARCHICAL_SETTINGS = {
  importRelations: ['imports', 'imports_from'] as const,
  levelSpacingY: 140,
  nodeSpacingX: 36,
};

/** The four layout ids this package can compute. Not a `z.enum` here — that copy lives on the wire contract, `shared/src/domain/knowledge.ts`, which cannot depend back on this package. */
export const LAYOUT_IDS = ['force-atlas2', 'circlepack', 'hierarchical', 'noverlap'] as const;
export type LayoutId = (typeof LAYOUT_IDS)[number];
export const DEFAULT_LAYOUT_ID: LayoutId = 'force-atlas2';

/** Whether `value` is one of {@link LAYOUT_IDS} — the desktop handler's fallback for a request carrying an unknown/stale id. */
export function isLayoutId(value: string): value is LayoutId {
  return (LAYOUT_IDS as readonly string[]).includes(value);
}

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

/**
 * A fixed-seed PRNG (mulberry32) standing in for `Math.random` wherever a
 * `graphology-layout` module accepts an `rng` option — `circlepack`'s own
 * shuffle step defaults to `Math.random`, which is the one place that
 * dependency would otherwise break the "same input, same coordinates"
 * guarantee every layout in this file carries. The seed is a fixed constant,
 * not derived from time or entropy, matching {@link seedDeterministicLayout}'s
 * own discipline.
 */
export function deterministicRng(seed = 0x2f6e2b1): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a graphology `Graph` from the lean projection — layout input only,
 * discarded after. Carries `community` on every node and `relation` on every
 * edge (Theme E) beside `weight`, purely so {@link runCirclepack} and
 * {@link runHierarchical} have something to group/order by; ForceAtlas2 never
 * reads either.
 */
export function toGraphologyGraph(lean: LeanGraph): Graph {
  const graph = new Graph({ type: 'undirected', multi: true, allowSelfLoops: true });
  for (const node of lean.nodes) {
    if (!graph.hasNode(node.id)) graph.addNode(node.id, { community: node.community });
  }
  for (const link of lean.links) {
    // A link may reference a node graphify pruned from `nodes[]` (e.g. an
    // external symbol) — skip rather than throw, matching this package's
    // "never throws" rule for anything that touches file-shaped input.
    if (!graph.hasNode(link.source) || !graph.hasNode(link.target)) continue;
    graph.addEdge(link.source, link.target, { weight: link.weight, relation: link.relation });
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
 * progress after each batch — a multi-second pass over 15,292 nodes must not
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

/**
 * Circlepack by community (Phase 89 Theme E) — one nested circle per
 * `community` value, packed by `graphology-layout/circlepack`. Not iterative
 * (a single deterministic pack), so it reports one `onProgress` call rather
 * than batching like ForceAtlas2.
 */
export function runCirclepack(graph: Graph, onProgress?: (done: number, total: number) => void): void {
  circlepack.assign(graph, {
    hierarchyAttributes: CIRCLEPACK_SETTINGS.hierarchyAttributes,
    scale: CIRCLEPACK_SETTINGS.scale,
    rng: deterministicRng(),
  });
  onProgress?.(1, 1);
}

/**
 * Layers every node by its depth along `imports`/`imports_from` edges —
 * nodes nothing imports (or that import nothing) sit at level 0, and each
 * edge moves its target one level deeper. Import graphs are not acyclic in
 * practice (JS/TS modules commonly import each other in a cycle), so this is
 * Kahn's algorithm with an explicit, deterministic cycle-break: whenever no
 * node has zero remaining in-degree, the smallest remaining id (never
 * whichever the traversal happens to reach first) is peeled off as its own
 * one-node level — the same "sorted, not insertion-order" discipline
 * {@link seedDeterministicLayout} uses, so two runs over the same input
 * produce the same levels even when the graph has import cycles.
 */
function computeImportLevels(graph: Graph): Map<string, number> {
  const ids = graph.nodes().sort();
  const importRelations = new Set<string>(HIERARCHICAL_SETTINGS.importRelations);
  const outAdjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const id of ids) {
    outAdjacency.set(id, []);
    inDegree.set(id, 0);
  }
  graph.forEachEdge((_edge, attributes, source, target) => {
    if (!importRelations.has(String(attributes.relation))) return;
    outAdjacency.get(source)?.push(target);
    inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
  });
  for (const targets of outAdjacency.values()) targets.sort();

  const level = new Map<string, number>();
  const processed = new Set<string>();
  const remaining = new Map(inDegree);
  let frontier = ids.filter((id) => (remaining.get(id) ?? 0) === 0);
  let depth = 0;

  while (processed.size < ids.length) {
    if (frontier.length === 0) {
      const next = ids.find((id) => !processed.has(id));
      if (next === undefined) break;
      frontier = [next];
    }
    const thisLevel = [...frontier].sort();
    frontier = [];
    const nextFrontier = new Set<string>();
    for (const id of thisLevel) {
      if (processed.has(id)) continue;
      level.set(id, depth);
      processed.add(id);
      for (const target of outAdjacency.get(id) ?? []) {
        if (processed.has(target)) continue;
        const left = (remaining.get(target) ?? 0) - 1;
        remaining.set(target, left);
        if (left <= 0) nextFrontier.add(target);
      }
    }
    frontier = [...nextFrontier];
    depth += 1;
  }
  return level;
}

/**
 * Hierarchical, by import direction (Phase 89 Theme E) — {@link
 * computeImportLevels}'s levels become rows (`y = level * levelSpacingY`),
 * and within a row nodes are laid out left-to-right sorted by id
 * (`x` centred on 0), the same "sort before positioning" rule every
 * deterministic layout here follows.
 */
export function runHierarchical(graph: Graph, onProgress?: (done: number, total: number) => void): void {
  const levels = computeImportLevels(graph);
  const byLevel = new Map<number, string[]>();
  for (const [id, lvl] of levels) {
    const bucket = byLevel.get(lvl);
    if (bucket) bucket.push(id);
    else byLevel.set(lvl, [id]);
  }
  for (const [lvl, ids] of byLevel) {
    ids.sort();
    const count = ids.length;
    ids.forEach((id, index) => {
      const x = (index - (count - 1) / 2) * HIERARCHICAL_SETTINGS.nodeSpacingX;
      const y = lvl * HIERARCHICAL_SETTINGS.levelSpacingY;
      graph.setNodeAttribute(id, 'x', x);
      graph.setNodeAttribute(id, 'y', y);
    });
  }
  onProgress?.(1, 1);
}

/**
 * Noverlap, as a post-pass over a ForceAtlas2 base (Phase 89 Theme E) — the
 * phase doc frames noverlap as "a post-pass over any of them"; this is the
 * one pill that exercises it, layered on ForceAtlas2's own output since dense
 * ForceAtlas2 clusters are exactly where nodes end up stacked. Deterministic:
 * `graphology-layout-noverlap` reads only the graph's own `x`/`y` (already
 * deterministic off ForceAtlas2) and fixed settings, no RNG.
 */
export function runNoverlap(
  graph: Graph,
  totalIterations: number,
  batchSize: number,
  onProgress?: (done: number, total: number) => void,
): void {
  runForceAtlas2(graph, totalIterations, batchSize, onProgress);
  noverlap.assign(graph, {
    maxIterations: NOVERLAP_SETTINGS.maxIterations,
    settings: NOVERLAP_SETTINGS.settings,
  });
}

/**
 * Dispatches to the right layout by id (Phase 89 Theme E) — the one function
 * `layout-worker.ts` and `layoutGraph` need to know about, so adding a fifth
 * layout later is a new `case`, not a change to either caller.
 */
export function runLayout(
  graph: Graph,
  layoutId: LayoutId,
  totalIterations: number,
  batchSize: number,
  onProgress?: (done: number, total: number) => void,
): void {
  switch (layoutId) {
    case 'force-atlas2':
      runForceAtlas2(graph, totalIterations, batchSize, onProgress);
      return;
    case 'circlepack':
      runCirclepack(graph, onProgress);
      return;
    case 'hierarchical':
      runHierarchical(graph, onProgress);
      return;
    case 'noverlap':
      runNoverlap(graph, totalIterations, batchSize, onProgress);
      return;
    default: {
      const exhaustive: never = layoutId;
      throw new Error(`Unknown layout id: ${String(exhaustive)}`);
    }
  }
}

/** Compute deterministic layout positions for a lean graph, in one call — the test-facing entry point. */
export function layoutGraph(
  lean: LeanGraph,
  options: { layoutId?: LayoutId; totalIterations?: number; batchSize?: number } = {},
): LayoutPositions {
  const layoutId = options.layoutId ?? DEFAULT_LAYOUT_ID;
  const totalIterations = options.totalIterations ?? 100;
  const batchSize = options.batchSize ?? 25;
  const graph = toGraphologyGraph(lean);
  runLayout(graph, layoutId, totalIterations, batchSize);
  return extractPositions(graph);
}
