import type { KnowledgeGraphNode } from '@midnite/studio-shared';

/**
 * The community list's "tree" mode, flattened for a virtualizer: one row per
 * community, followed — when that community is expanded — by one row per
 * member node. Pure, so `knowledge-community-tree.test.ts` covers the search
 * semantics without rendering anything.
 *
 * Search in tree mode matches community names OR member labels: a community
 * with a matching member is kept (and force-expanded, showing only the
 * matching members), so typing a symbol finds it under whichever community
 * graphify filed it.
 */
export type CommunityTreeRow =
  | { kind: 'community'; name: string; memberCount: number; expanded: boolean }
  | { kind: 'node'; id: string; label: string; communityName: string };

export function flattenCommunityTree(input: {
  communityNames: readonly string[];
  nodesByCommunity: ReadonlyMap<string, readonly Pick<KnowledgeGraphNode, 'id' | 'label'>[]>;
  expanded: ReadonlySet<string>;
  query: string;
}): CommunityTreeRow[] {
  const needle = input.query.trim().toLowerCase();
  const rows: CommunityTreeRow[] = [];

  for (const name of input.communityNames) {
    const members = input.nodesByCommunity.get(name) ?? [];
    if (!needle) {
      const expanded = input.expanded.has(name);
      rows.push({ kind: 'community', name, memberCount: members.length, expanded });
      if (expanded) {
        for (const member of members) {
          rows.push({ kind: 'node', id: member.id, label: member.label, communityName: name });
        }
      }
      continue;
    }

    const nameMatches = name.toLowerCase().includes(needle);
    const matchingMembers = members.filter((member) => member.label.toLowerCase().includes(needle));
    if (!nameMatches && matchingMembers.length === 0) continue;

    // A name hit lists the community collapsed unless the user expanded it;
    // a member hit force-expands to show exactly the members that matched.
    const expanded = matchingMembers.length > 0 || input.expanded.has(name);
    rows.push({ kind: 'community', name, memberCount: members.length, expanded });
    if (expanded) {
      const shown = matchingMembers.length > 0 ? matchingMembers : members;
      for (const member of shown) {
        rows.push({ kind: 'node', id: member.id, label: member.label, communityName: name });
      }
    }
  }
  return rows;
}
