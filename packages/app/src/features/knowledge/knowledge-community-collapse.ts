import type {
  KnowledgeGraphLink,
  KnowledgeGraphNode,
  KnowledgeLayoutPosition,
} from '@midnite/studio-shared';

import type { KnowledgeFilterState } from './knowledge-filters';
import { isCommunityVisible } from './knowledge-filters';

/**
 * Collapse a community into one meta-node — pure data, no canvas involved.
 *
 * graphify's communities are flat (a number + a name per node, no
 * hierarchy), so "collapse" here means: hide every member node and stand a
 * single community node at their centroid, with the members' cross-community
 * edges folded into aggregated meta-edges. `use-sigma-graph.ts` is the only
 * consumer that mutates a graphology graph with this; everything it needs to
 * decide is computed here so it can be vitest-covered without WebGL.
 */

const COMMUNITY_NODE_PREFIX = 'community:';

export function communityNodeId(communityName: string): string {
  return `${COMMUNITY_NODE_PREFIX}${communityName}`;
}

export function isCommunityNodeId(nodeId: string): boolean {
  return nodeId.startsWith(COMMUNITY_NODE_PREFIX);
}

/** The community a meta-node stands for, or `null` for an ordinary node id. */
export function communityNameFromNodeId(nodeId: string): string | null {
  return isCommunityNodeId(nodeId) ? nodeId.slice(COMMUNITY_NODE_PREFIX.length) : null;
}

export type CommunityCentroid = {
  x: number;
  y: number;
  /** Member count — the meta-node's size is a function of it. */
  count: number;
  /** The community's number, so the meta-node paints in the same colour its members do. */
  community: number;
};

/**
 * Where each community's meta-node sits: the mean of its members' laid-out
 * positions. Computed once per payload — positions never change after
 * layout, so neither do these.
 */
export function communityCentroids(
  nodes: readonly Pick<KnowledgeGraphNode, 'id' | 'community' | 'communityName'>[],
  positions: Readonly<Record<string, KnowledgeLayoutPosition>>,
): Map<string, CommunityCentroid> {
  const sums = new Map<string, { x: number; y: number; count: number; community: number }>();
  for (const node of nodes) {
    const pos = positions[node.id] ?? { x: 0, y: 0 };
    const entry = sums.get(node.communityName);
    if (entry) {
      entry.x += pos.x;
      entry.y += pos.y;
      entry.count += 1;
    } else {
      sums.set(node.communityName, { x: pos.x, y: pos.y, count: 1, community: node.community });
    }
  }
  const centroids = new Map<string, CommunityCentroid>();
  for (const [name, sum] of sums) {
    centroids.set(name, {
      x: sum.x / sum.count,
      y: sum.y / sum.count,
      count: sum.count,
      community: sum.community,
    });
  }
  return centroids;
}

/** Meta-node radius from member count — the same sqrt curve nodes use for degree, with a higher floor so a collapsed community reads as "many". */
export function sizeForMemberCount(count: number, minSize = 6, maxSize = 26): number {
  return Math.min(maxSize, minSize + Math.sqrt(Math.max(count, 0)) * 1.2);
}

export type AggregatedEdge = {
  /** Stable key — `source|target` — so a rebuild reuses the same graphology edge key. */
  key: string;
  source: string;
  target: string;
  /** Every distinct relation folded in; the edge is visible when ANY of them passes the relation filter. */
  relations: string[];
  /** The strongest folded edge's weight/confidence — the filter sliders read these. */
  weight: number;
  confidence: number;
  /** How many raw links this stands for — drawn thicker for more. */
  count: number;
};

/**
 * The meta-edges a set of collapsed communities needs. Each raw link whose
 * endpoints resolve to different display nodes — where a member of a
 * collapsed community resolves to its community node — contributes to one
 * aggregated edge. Links entirely inside one collapsed community vanish (a
 * node has no edge to itself), and links touching no collapsed community
 * are left alone (they are still drawn as themselves).
 *
 * Rebuilt from scratch on every change to `collapsed` rather than patched:
 * collapsing community D must re-point every existing `C → node-in-D` meta-
 * edge at `C → D`, and one pass over the links is cheaper to reason about
 * than that diff. Measured shape: one pass over ~36k links, a few hundred
 * output edges even with every community collapsed.
 */
export function aggregateCommunityEdges(
  links: readonly Pick<
    KnowledgeGraphLink,
    'source' | 'target' | 'relation' | 'weight' | 'confidence'
  >[],
  communityByNodeId: ReadonlyMap<string, string>,
  collapsed: ReadonlySet<string>,
): AggregatedEdge[] {
  if (collapsed.size === 0) return [];
  const byKey = new Map<string, AggregatedEdge & { relationSet: Set<string> }>();

  const resolve = (nodeId: string): { id: string; collapsed: boolean } => {
    const community = communityByNodeId.get(nodeId);
    if (community !== undefined && collapsed.has(community)) {
      return { id: communityNodeId(community), collapsed: true };
    }
    return { id: nodeId, collapsed: false };
  };

  for (const link of links) {
    const source = resolve(link.source);
    const target = resolve(link.target);
    if (!source.collapsed && !target.collapsed) continue;
    if (source.id === target.id) continue;
    const key = `${source.id}|${target.id}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.relationSet.add(link.relation);
      existing.weight = Math.max(existing.weight, link.weight);
      existing.confidence = Math.max(existing.confidence, link.confidence);
      existing.count += 1;
    } else {
      byKey.set(key, {
        key,
        source: source.id,
        target: target.id,
        relations: [],
        relationSet: new Set([link.relation]),
        weight: link.weight,
        confidence: link.confidence,
        count: 1,
      });
    }
  }

  const out: AggregatedEdge[] = [];
  for (const entry of byKey.values()) {
    const { relationSet, ...edge } = entry;
    out.push({ ...edge, relations: [...relationSet].sort() });
  }
  return out;
}

/**
 * Whether an aggregated edge is on the canvas: any folded relation passes
 * the relation filter, its strongest weight/confidence clear the sliders,
 * and both endpoint communities are shown. Mirrors `isLinkVisible` for the
 * many-relations case.
 */
export function isAggregatedEdgeVisible(
  edge: Pick<AggregatedEdge, 'relations' | 'weight' | 'confidence'>,
  sourceCommunityName: string,
  targetCommunityName: string,
  state: KnowledgeFilterState,
): boolean {
  return (
    edge.relations.some((relation) => state.relations.has(relation)) &&
    edge.weight >= state.minWeight &&
    edge.confidence >= state.minConfidence &&
    isCommunityVisible(sourceCommunityName, state) &&
    isCommunityVisible(targetCommunityName, state)
  );
}

/** Group node ids by community name, in `nodes` order — the tree list and the community panel both read this. */
export function nodesByCommunity<T extends Pick<KnowledgeGraphNode, 'communityName'>>(
  nodes: readonly T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const node of nodes) {
    const list = map.get(node.communityName);
    if (list) list.push(node);
    else map.set(node.communityName, [node]);
  }
  return map;
}
