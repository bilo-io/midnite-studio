import type { KnowledgeGraphPayload } from '@midnite/studio-shared';

import {
  aggregateCommunityEdges,
  communityCentroids,
  communityNodeId,
  isAggregatedEdgeVisible,
  nodesByCommunity,
  sizeForMemberCount,
} from '../knowledge-community-collapse';
import { computeDegrees, sizeForDegree } from '../knowledge-degree';
import { selectCoreNodeIds } from '../knowledge-detail';
import { isCommunityVisible, isLinkRelationVisible, searchMatches, type KnowledgeFilterState } from '../knowledge-filters';
import { computeHighlightSets } from '../knowledge-highlight';
import { alphaForWeight, targetAlphaForState } from '../knowledge-canvas-colors';

/**
 * The engine-neutral model every non-sigma 2D variant draws from (Phase 89 Themes F-I).
 *
 * force-graph, cytoscape, vis-network and the live d3-force canvas all want the same four things
 * from a payload — which nodes are mounted, where they sit, what colour they are and how
 * visible they are right now — and none of them should re-derive it. Keeping that here, pure and
 * DOM-free, is what makes "a community is the same colour in every variant" and "the focus alpha
 * model is the same in every variant" structural rather than a convention four modules each
 * have to remember. The engine adapters only translate this into their library's own idiom.
 *
 * It mirrors `buildScene3D`'s node/edge selection (detail budget, collapsed communities as
 * meta-nodes with aggregated edges) minus the 3D projection.
 */
export type Node2D = {
  id: string;
  label: string;
  community: number;
  communityName: string;
  degree: number;
  kind: 'node' | 'community';
  memberCount: number;
  x: number;
  y: number;
  /** Radius in px, the same degree curve sigma uses (`sizeForDegree`). */
  size: number;
  /** `rgb(r, g, b)` — straight, un-premultiplied; `withAlpha` is applied at paint time. */
  color: string;
};

export type Link2D = {
  id: string;
  source: string;
  target: string;
  relation: string;
  /** Aggregated edges stand for several raw links and carry every folded relation. */
  relations: string[];
  weight: number;
  confidence: number;
  aggregated: boolean;
  sourceCommunityName: string;
  targetCommunityName: string;
};

export type Model2D = {
  nodes: Node2D[];
  links: Link2D[];
  nodeById: ReadonlyMap<string, Node2D>;
  /** One hop, either direction, over the mounted links only. */
  neighbours: ReadonlyMap<string, ReadonlySet<string>>;
  /** Mean of the mounted nodes' positions — the intro's origin (Theme B's reasoning: not `{0, 0}`). */
  centroid: { x: number; y: number };
};

export function buildModel2D(
  payload: KnowledgeGraphPayload,
  options: {
    maxNodes: number;
    collapsedCommunities: ReadonlySet<string>;
    /** `communityColor` bound to the host's token resolver — injected so this stays DOM-free. */
    colorFor: (community: number) => string;
  },
): Model2D {
  const collapsed = options.collapsedCommunities;
  const degrees = computeDegrees(payload.links);
  const core = selectCoreNodeIds(payload.nodes, degrees, options.maxNodes);
  const grouped = nodesByCommunity(payload.nodes);
  const centroids = communityCentroids(payload.nodes, payload.positions);

  const nodes: Node2D[] = [];
  const nodeById = new Map<string, Node2D>();
  const communityByRawNode = new Map<string, string>();
  for (const node of payload.nodes) communityByRawNode.set(node.id, node.communityName);

  for (const name of collapsed) {
    const members = grouped.get(name);
    const centroid = centroids.get(name);
    if (!members || members.length === 0 || !centroid) continue;
    const id = communityNodeId(name);
    const node: Node2D = {
      id,
      label: `${name} (${members.length})`,
      community: centroid.community,
      communityName: name,
      degree: members.reduce((sum, member) => sum + (degrees.get(member.id) ?? 0), 0),
      kind: 'community',
      memberCount: members.length,
      x: centroid.x,
      y: centroid.y,
      size: sizeForMemberCount(members.length),
      color: options.colorFor(centroid.community),
    };
    nodes.push(node);
    nodeById.set(id, node);
  }

  for (const raw of payload.nodes) {
    if (core && !core.has(raw.id)) continue;
    if (collapsed.has(raw.communityName)) continue;
    const position = payload.positions[raw.id] ?? { x: 0, y: 0 };
    const degree = degrees.get(raw.id) ?? 0;
    const node: Node2D = {
      id: raw.id,
      label: raw.label,
      community: raw.community,
      communityName: raw.communityName,
      degree,
      kind: 'node',
      memberCount: 1,
      x: position.x,
      y: position.y,
      size: sizeForDegree(degree),
      color: options.colorFor(raw.community),
    };
    nodes.push(node);
    nodeById.set(raw.id, node);
  }

  const links: Link2D[] = [];
  const neighbours = new Map<string, Set<string>>();
  const connect = (a: string, b: string): void => {
    let aSet = neighbours.get(a);
    if (!aSet) neighbours.set(a, (aSet = new Set()));
    aSet.add(b);
    let bSet = neighbours.get(b);
    if (!bSet) neighbours.set(b, (bSet = new Set()));
    bSet.add(a);
  };

  for (let i = 0; i < payload.links.length; i += 1) {
    const link = payload.links[i]!;
    const sourceCommunity = communityByRawNode.get(link.source);
    const targetCommunity = communityByRawNode.get(link.target);
    if (sourceCommunity === undefined || targetCommunity === undefined) continue;
    if (collapsed.has(sourceCommunity) || collapsed.has(targetCommunity)) continue;
    if (!nodeById.has(link.source) || !nodeById.has(link.target)) continue;
    links.push({
      id: `e${i}`,
      source: link.source,
      target: link.target,
      relation: link.relation,
      relations: [link.relation],
      weight: link.weight,
      confidence: link.confidence,
      aggregated: false,
      sourceCommunityName: sourceCommunity,
      targetCommunityName: targetCommunity,
    });
    connect(link.source, link.target);
  }

  for (const edge of aggregateCommunityEdges(payload.links, communityByRawNode, collapsed)) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) continue;
    links.push({
      id: `a:${edge.key}`,
      source: edge.source,
      target: edge.target,
      relation: edge.relations[0] ?? 'related',
      relations: edge.relations,
      weight: edge.weight,
      confidence: edge.confidence,
      aggregated: true,
      sourceCommunityName: source.communityName,
      targetCommunityName: target.communityName,
    });
    connect(edge.source, edge.target);
  }

  let sumX = 0;
  let sumY = 0;
  for (const node of nodes) {
    sumX += node.x;
    sumY += node.y;
  }
  const centroid = nodes.length === 0 ? { x: 0, y: 0 } : { x: sumX / nodes.length, y: sumY / nodes.length };
  return { nodes, links, nodeById, neighbours, centroid };
}

/** What an engine needs to know to paint one frame's worth of visibility and dimming. */
export type Paint2D = {
  nodeVisible: ReadonlyMap<string, boolean>;
  /** Straight alpha scalar per node — the C model (`targetAlphaForState`): rest / neighbour / focus / dimmed. */
  nodeAlpha: ReadonlyMap<string, number>;
  linkVisible: ReadonlyMap<string, boolean>;
  /** Weight-scaled at rest (`alphaForWeight`), dimmed when it touches no focus node. */
  linkAlpha: ReadonlyMap<string, number>;
  /** Links touching a focus node, drawn thicker / in the accent. */
  linkEmphasised: ReadonlySet<string>;
  /** The selected node only — engines draw their own ring. */
  selectedNodeId: string | null;
};

/** Edge alpha at rest and when dimmed — the same `0.15…0.8` weight range and dim floor sigma uses. */
const LINK_DIMMED_ALPHA = 0.05;

/**
 * One frame's visibility and alpha from the filters and the selection. Pure: it is the single place
 * where the filter state and the C-theme highlight model meet a model, so every engine dims
 * identically and the unit test needs no canvas.
 */
export function computePaint2D(
  model: Model2D,
  filters: KnowledgeFilterState,
  selectedNodeId: string | null,
): Paint2D {
  const matches = searchMatches(model.nodes, filters.query);
  const sets = computeHighlightSets({
    searchMatchIds: matches,
    selectedNodeId,
    hoveredNodeId: null,
    neighborsOf: (id) => model.neighbours.get(id) ?? [],
  });

  const nodeVisible = new Map<string, boolean>();
  const nodeAlpha = new Map<string, number>();
  for (const node of model.nodes) {
    nodeVisible.set(node.id, isCommunityVisible(node.communityName, filters));
    const isFocus = sets.focusIds.has(node.id);
    const isNeighbor = sets.neighborIds.has(node.id);
    nodeAlpha.set(
      node.id,
      targetAlphaForState({ dimmed: sets.active && !isFocus && !isNeighbor, isFocus, isNeighbor }),
    );
  }

  const linkVisible = new Map<string, boolean>();
  const linkAlpha = new Map<string, number>();
  const linkEmphasised = new Set<string>();
  for (const link of model.links) {
    const visible = link.aggregated
      ? isAggregatedEdgeVisible(link, link.sourceCommunityName, link.targetCommunityName, filters)
      : isLinkRelationVisible(link, filters) &&
        isCommunityVisible(link.sourceCommunityName, filters) &&
        isCommunityVisible(link.targetCommunityName, filters);
    linkVisible.set(link.id, visible);
    const touchesFocus = sets.active && (sets.focusIds.has(link.source) || sets.focusIds.has(link.target));
    if (touchesFocus) linkEmphasised.add(link.id);
    linkAlpha.set(
      link.id,
      sets.active && !touchesFocus ? LINK_DIMMED_ALPHA : alphaForWeight(link.weight),
    );
  }
  return { nodeVisible, nodeAlpha, linkVisible, linkAlpha, linkEmphasised, selectedNodeId };
}

/**
 * `withAlpha` (knowledge-canvas-colors.ts) premultiplies, which is right for sigma's
 * `gl.ONE, ONE_MINUS_SRC_ALPHA` blend and wrong for everything else: canvas 2D, cytoscape and
 * vis-network all blend straight alpha, where a premultiplied colour dims TWICE. The alpha
 * SCALARS in `Paint2D` are shared; only this last step differs per blend mode.
 */
export function straightAlpha(rgbColor: string, alpha: number): string {
  const match = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(rgbColor);
  if (!match) return rgbColor;
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${a})`;
}
