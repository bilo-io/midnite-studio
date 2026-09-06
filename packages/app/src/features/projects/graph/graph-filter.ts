import type { ForgeGraph } from '@midnite/studio-shared';

import { nodeKey } from './graph-layout';

/**
 * The dependency graph's own facets (Phase 75 Theme H) — narrower than the
 * shared toolbar filter (`filter.ts`, unchanged), and meaningful only in
 * graph mode. Kept on `ProjectViewState.graph` (`ui-store.ts`) rather than a
 * new store slice, since a facet describing the board's own shape should
 * follow the board across every repo that reaches it, exactly like `filter`
 * already does.
 */
export interface ProjectGraphFacets {
  /** The `contains` layer (parent/sub-issue). Off by default — nesting a
   *  parent's children is not a blocking relationship and would otherwise
   *  read as one. */
  showContains: boolean;
  /** A three-way choice rather than two booleans: "blocked and ready" is
   *  empty by construction, and two checkboxes would advertise a state that
   *  cannot exist. */
  only: 'all' | 'blocked' | 'ready';
  /** Hops along `blocks` edges from the selected node. `0` is off. Meaningless
   *  with no selection — the caller disables the control in that case rather
   *  than this type forbidding it. */
  depth: 0 | 1 | 2;
  /** Drop any node left with no incident edge once every other facet above
   *  has already narrowed the graph. */
  hideIsolated: boolean;
}

export const DEFAULT_GRAPH_FACETS: ProjectGraphFacets = {
  showContains: false,
  only: 'all',
  depth: 0,
  hideIsolated: false,
};

export function isDefaultGraphFacets(facets: ProjectGraphFacets): boolean {
  return (
    facets.showContains === DEFAULT_GRAPH_FACETS.showContains &&
    facets.only === DEFAULT_GRAPH_FACETS.only &&
    facets.depth === DEFAULT_GRAPH_FACETS.depth &&
    facets.hideIsolated === DEFAULT_GRAPH_FACETS.hideIsolated
  );
}

/** Every node keyed once, so the pipeline below never recomputes `nodeKey`
 *  per lookup. */
function keyNodes(graph: ForgeGraph): Map<string, ForgeGraph['nodes'][number]> {
  return new Map(graph.nodes.map((node) => [nodeKey(node), node] as const));
}

function edgesWithin(edges: ForgeGraph['edges'], keys: ReadonlySet<string>): ForgeGraph['edges'] {
  return edges.filter((edge) => keys.has(edge.from) && keys.has(edge.to));
}

/**
 * Narrows `graph` to what the shared item filter and this graph's own facets
 * allow onto the canvas — applied after `resolveForgeGraph` and before
 * `layoutForgeGraph`, so ranking/barycentre never sees a node the view won't
 * draw. Pure: same graph/options in, same graph out.
 *
 * **The pipeline, in order:**
 * 1. **Item filter.** A node naming a real board item (`itemId !== ''`) that
 *    did not survive the shared toolbar filter is dropped; a genuinely
 *    foreign node (referenced but never itself a board item) was never a
 *    candidate for that filter and always survives. An edge only ever
 *    renders once both its endpoints do, so a filtered-out node's own
 *    dependencies vanish cleanly instead of dangling into empty space.
 * 2. **`showContains`.** `'contains'` edges are dropped outright when off —
 *    the node set is untouched; only the edges pretending to describe
 *    epics/sub-issues disappear.
 * 3. **`depth`.** With a selection and `depth > 0`, keeps only nodes within
 *    that many hops of the selected node along surviving `'blocks'` edges
 *    (both directions, so both a node's blockers and what it blocks stay
 *    visible) — the doc's own "hops along blocks edges", never `'contains'`.
 *    A no-op when nothing is selected or the selection itself did not
 *    survive an earlier step.
 * 4. **`only`.** Keeps only nodes whose own `blocked`/`ready` flag matches —
 *    a structural filter, not a "keep the blockers of a match too" one: a
 *    blocked node's own unmet blocker can still disappear from view if it is
 *    itself neither blocked nor ready. Simpler than the alternative, and
 *    what the doc's own wording ("blocked only") describes literally.
 * 5. **`hideIsolated`.** Drops any node left with no incident edge once every
 *    facet above already ran — "isolated" means isolated in what is
 *    currently drawn, not isolated on the whole board.
 */
export function filterForgeGraph(
  graph: ForgeGraph,
  options: {
    /** Ids of the `ForgeProjectItem`s that survived the shared toolbar
     *  filter — a real (non-foreign) node not in this set is dropped. */
    filteredItemIds: ReadonlySet<string>;
    facets: ProjectGraphFacets;
    /** The selected node's own key (`nodeKey(node)`), or `null`/`undefined`
     *  with nothing selected. */
    selectedNodeKey?: string | null;
  },
): ForgeGraph {
  const { filteredItemIds, facets, selectedNodeKey } = options;
  const byKey = keyNodes(graph);

  let keptKeys = new Set(
    graph.nodes.filter((node) => node.foreign || filteredItemIds.has(node.itemId)).map((node) => nodeKey(node)),
  );
  let edges = edgesWithin(graph.edges, keptKeys);

  if (!facets.showContains) {
    edges = edges.filter((edge) => edge.kind !== 'contains');
  }

  if (facets.depth > 0 && selectedNodeKey && keptKeys.has(selectedNodeKey)) {
    const adjacency = new Map<string, string[]>();
    const link = (a: string, b: string) => {
      const list = adjacency.get(a);
      if (list) list.push(b);
      else adjacency.set(a, [b]);
    };
    for (const edge of edges) {
      if (edge.kind !== 'blocks') continue;
      link(edge.from, edge.to);
      link(edge.to, edge.from);
    }

    const within = new Set<string>([selectedNodeKey]);
    let frontier = [selectedNodeKey];
    for (let hop = 0; hop < facets.depth; hop++) {
      const next: string[] = [];
      for (const key of frontier) {
        for (const neighbor of adjacency.get(key) ?? []) {
          if (!within.has(neighbor)) {
            within.add(neighbor);
            next.push(neighbor);
          }
        }
      }
      frontier = next;
    }

    keptKeys = new Set([...keptKeys].filter((key) => within.has(key)));
    edges = edgesWithin(edges, keptKeys);
  }

  if (facets.only !== 'all') {
    keptKeys = new Set(
      [...keptKeys].filter((key) => {
        const node = byKey.get(key);
        return node !== undefined && (facets.only === 'blocked' ? node.blocked : node.ready);
      }),
    );
    edges = edgesWithin(edges, keptKeys);
  }

  if (facets.hideIsolated) {
    const connected = new Set<string>();
    for (const edge of edges) {
      connected.add(edge.from);
      connected.add(edge.to);
    }
    keptKeys = new Set([...keptKeys].filter((key) => connected.has(key)));
  }

  const nodes = graph.nodes.filter((node) => keptKeys.has(nodeKey(node)));
  return { ...graph, nodes, edges: edgesWithin(edges, keptKeys) };
}
