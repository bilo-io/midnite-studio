import type { KnowledgeGraphLink, KnowledgeGraphNode } from '@midnite/studio-shared';

/**
 * Theme E's filter/search state — pure data, no canvas needed to compute what
 * it selects (`knowledge-filters.test.ts` covers this file directly).
 * `knowledge-filters-store.ts` wraps it per-repo, in memory only, per the
 * phase doc: "Filter state is per-repo and survives a view switch, but is
 * not persisted across restarts this phase."
 */
export type KnowledgeFilterState = {
  /** Substring search over node labels — Theme E's "search and focus". Case-insensitive. */
  query: string;
  /** A link's `relation` must be a member of this set to be visible. */
  relations: ReadonlySet<string>;
  /** 0..1, AND'd with `relations`. */
  minWeight: number;
  /** 0..1, AND'd with `relations` — Decision 8's "hide low-confidence inferred ones". */
  minConfidence: number;
  /** `communityName`s toggled OFF — a block-list, not an allow-list (600 communities start shown). */
  hiddenCommunities: ReadonlySet<string>;
};

/**
 * `'calls'` alone, per the phase doc's Decision 8 ("start with call edges…").
 * Measured against this repo's own `graph.json`: `relation === 'calls'` is
 * 6,066 of 36,032 edges (~17%), a legible first paint. Decision 8's other
 * half — "plus anything above a confidence threshold" — is deliberately
 * NOT baked into this default: measured on the same graph, 35,763 of 36,032
 * links score `confidence_score === 1` (graphify's own AST extraction is
 * almost always fully confident), so any threshold below 1 lets through
 * 99%+ of edges and defeats "legible first paint" — the doc's own stated
 * priority ("The number matters more than the rule"). `minConfidence`
 * starts at 0 (no gate) and is a user-adjustable slider instead — raising it
 * alongside widening `relations` is how "everything except low-confidence
 * junk" is actually reached, which is the goal Decision 8 named.
 */
export const DEFAULT_RELATIONS: ReadonlySet<string> = new Set(['calls']);

export function defaultFilterState(): KnowledgeFilterState {
  return {
    query: '',
    relations: DEFAULT_RELATIONS,
    minWeight: 0,
    minConfidence: 0,
    hiddenCommunities: new Set(),
  };
}

export function isLinkRelationVisible(
  link: Pick<KnowledgeGraphLink, 'relation' | 'weight' | 'confidence'>,
  state: Pick<KnowledgeFilterState, 'relations' | 'minWeight' | 'minConfidence'>,
): boolean {
  return (
    state.relations.has(link.relation) &&
    link.weight >= state.minWeight &&
    link.confidence >= state.minConfidence
  );
}

export function isCommunityVisible(
  communityName: string,
  state: Pick<KnowledgeFilterState, 'hiddenCommunities'>,
): boolean {
  return !state.hiddenCommunities.has(communityName);
}

/**
 * A link is on the canvas only when its own relation/weight/confidence pass
 * AND both endpoints' communities are shown — an edge to a hidden node has
 * nothing to point at.
 */
export function isLinkVisible(
  link: Pick<KnowledgeGraphLink, 'relation' | 'weight' | 'confidence'>,
  sourceCommunityName: string,
  targetCommunityName: string,
  state: KnowledgeFilterState,
): boolean {
  return (
    isLinkRelationVisible(link, state) &&
    isCommunityVisible(sourceCommunityName, state) &&
    isCommunityVisible(targetCommunityName, state)
  );
}

/** Node ids matching the current search query (case-insensitive substring on label). Empty query = no matches. */
export function searchMatches(
  nodes: readonly Pick<KnowledgeGraphNode, 'id' | 'label'>[],
  query: string,
): Set<string> {
  const needle = query.trim().toLowerCase();
  const matches = new Set<string>();
  if (!needle) return matches;
  for (const node of nodes) {
    if (node.label.toLowerCase().includes(needle)) matches.add(node.id);
  }
  return matches;
}

/**
 * The single node search "flies to" — the first match in `nodes` order,
 * deterministic so the same query always focuses the same node. `null` when
 * there are no matches at all.
 */
export function pickFocusNode(
  nodes: readonly Pick<KnowledgeGraphNode, 'id'>[],
  matches: ReadonlySet<string>,
): string | null {
  for (const node of nodes) {
    if (matches.has(node.id)) return node.id;
  }
  return null;
}

/** Every node one hop from `nodeId`, either direction — the "neighbourhood" search highlights. */
export function neighborIds(
  nodeId: string,
  links: readonly Pick<KnowledgeGraphLink, 'source' | 'target'>[],
): Set<string> {
  const neighbors = new Set<string>();
  for (const link of links) {
    if (link.source === nodeId) neighbors.add(link.target);
    else if (link.target === nodeId) neighbors.add(link.source);
  }
  return neighbors;
}

/** Distinct relations present in a graph's links, sorted — the filter panel's checkbox list. */
export function distinctRelations(
  links: readonly Pick<KnowledgeGraphLink, 'relation'>[],
): string[] {
  return [...new Set(links.map((link) => link.relation))].sort();
}

/** Distinct community names present, sorted — the community filter's searchable list. */
export function distinctCommunityNames(
  nodes: readonly Pick<KnowledgeGraphNode, 'communityName'>[],
): string[] {
  return [...new Set(nodes.map((node) => node.communityName))].sort();
}

/** How many of `links` pass the current filter — the panel's "N of 36,032 shown" count. */
export function countVisibleLinks(
  links: readonly Pick<KnowledgeGraphLink, 'source' | 'target' | 'relation' | 'weight' | 'confidence'>[],
  communityByNodeId: ReadonlyMap<string, string>,
  state: KnowledgeFilterState,
): number {
  let count = 0;
  for (const link of links) {
    const sourceCommunity = communityByNodeId.get(link.source);
    const targetCommunity = communityByNodeId.get(link.target);
    if (sourceCommunity === undefined || targetCommunity === undefined) continue;
    if (isLinkVisible(link, sourceCommunity, targetCommunity, state)) count += 1;
  }
  return count;
}
