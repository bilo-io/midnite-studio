/**
 * "What is lit up right now" — the one decision the node and edge reducers
 * in `use-sigma-graph.ts` share, pulled out so it is vitest-covered without
 * a canvas. Three sources of emphasis combine: the search matches, the
 * selected node (clicked, or picked from the tree) and the hovered node.
 * Whenever any of them is set, the graph is in a *focused* state: the focus
 * nodes and their one-hop neighbours paint at full strength, everything
 * else dims.
 */
export type HighlightSets = {
  /** True when something is focused at all — the trigger for dimming the rest. */
  active: boolean;
  /** The nodes the emphasis is ABOUT: search matches, the selection, the hover. */
  focusIds: ReadonlySet<string>;
  /** One hop out from every focus node — lit, but not as brightly. */
  neighborIds: ReadonlySet<string>;
};

const EMPTY: ReadonlySet<string> = new Set();

export function computeHighlightSets(input: {
  searchMatchIds: ReadonlySet<string>;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  /** One hop from a node, either direction — the graph's own adjacency, injected so this stays pure. */
  neighborsOf: (nodeId: string) => Iterable<string>;
}): HighlightSets {
  const focusIds = new Set<string>(input.searchMatchIds);
  if (input.selectedNodeId) focusIds.add(input.selectedNodeId);
  if (input.hoveredNodeId) focusIds.add(input.hoveredNodeId);
  if (focusIds.size === 0) return { active: false, focusIds: EMPTY, neighborIds: EMPTY };

  const neighborIds = new Set<string>();
  for (const id of focusIds) {
    for (const neighbor of input.neighborsOf(id)) {
      if (!focusIds.has(neighbor)) neighborIds.add(neighbor);
    }
  }
  return { active: true, focusIds, neighborIds };
}

export type NodePaint = {
  /** Painted at `DIMMED_ALPHA` — not a focus node, not a neighbour, while something IS focused. */
  dimmed: boolean;
  /** Draw the label whatever the zoom/degree LOD says. */
  forceLabel: boolean;
  /** sigma's `highlighted` ring — the selection only, never hover (sigma draws its own hover). */
  highlighted: boolean;
  zIndex: number;
};

/**
 * One node's paint from the highlight sets. `eligibleForLabel` is the LOD's
 * own verdict (degree threshold + sigma's rendered-size threshold) — a lit
 * node overrides it, a dimmed node never shows a label at all.
 */
export function nodePaint(
  nodeId: string,
  sets: HighlightSets,
  selectedNodeId: string | null,
): NodePaint {
  const isFocus = sets.focusIds.has(nodeId);
  const isNeighbor = sets.neighborIds.has(nodeId);
  const dimmed = sets.active && !isFocus && !isNeighbor;
  return {
    dimmed,
    forceLabel: isFocus || isNeighbor,
    highlighted: selectedNodeId === nodeId,
    zIndex: isFocus ? 3 : isNeighbor ? 2 : 1,
  };
}

export type EdgePaint = {
  dimmed: boolean;
  /** Touches a focus node — drawn in the accent colour, thicker. */
  emphasised: boolean;
  zIndex: number;
};

export function edgePaint(source: string, target: string, sets: HighlightSets): EdgePaint {
  if (!sets.active) return { dimmed: false, emphasised: false, zIndex: 0 };
  const touchesFocus = sets.focusIds.has(source) || sets.focusIds.has(target);
  return {
    dimmed: !touchesFocus,
    emphasised: touchesFocus,
    zIndex: touchesFocus ? 1 : 0,
  };
}
