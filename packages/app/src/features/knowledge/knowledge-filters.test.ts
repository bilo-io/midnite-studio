// Layer: vitest — pure reducer/selector logic, no canvas needed to test what a filter selects.
import { describe, expect, it } from 'vitest';

import {
  countVisibleLinks,
  DEFAULT_RELATIONS,
  defaultFilterState,
  distinctCommunityNames,
  distinctRelations,
  isCommunityVisible,
  isLinkRelationVisible,
  isLinkVisible,
  neighborIds,
  pickFocusNode,
  searchMatches,
} from './knowledge-filters';

const NODES = [
  { id: 'a', label: 'useNow', communityName: 'core' },
  { id: 'b', label: 'useNowTick', communityName: 'core' },
  { id: 'c', label: 'GraphView', communityName: 'graph' },
];

const LINKS = [
  { source: 'a', target: 'b', relation: 'calls', weight: 1, confidence: 1 },
  { source: 'b', target: 'c', relation: 'imports', weight: 1, confidence: 0.85 },
  { source: 'a', target: 'c', relation: 'imports', weight: 1, confidence: 0.6 },
];

describe('defaultFilterState', () => {
  it('shows only calls edges, no weight/confidence gate, no communities hidden', () => {
    const state = defaultFilterState();
    expect(state.relations).toEqual(DEFAULT_RELATIONS);
    expect(state.minWeight).toBe(0);
    expect(state.minConfidence).toBe(0);
    expect(state.hiddenCommunities.size).toBe(0);
    expect(state.query).toBe('');
  });
});

describe('isLinkRelationVisible', () => {
  it('passes a link whose relation is in the shown set', () => {
    expect(isLinkRelationVisible(LINKS[0]!, defaultFilterState())).toBe(true);
  });

  it('rejects a link whose relation is not in the shown set', () => {
    expect(isLinkRelationVisible(LINKS[1]!, defaultFilterState())).toBe(false);
  });

  it('AND-combines relation with a weight floor', () => {
    const state = { ...defaultFilterState(), relations: new Set(['imports']), minWeight: 1.5 };
    expect(isLinkRelationVisible(LINKS[1]!, state)).toBe(false);
  });

  it('AND-combines relation with a confidence floor', () => {
    const state = { ...defaultFilterState(), relations: new Set(['imports']), minConfidence: 0.8 };
    expect(isLinkRelationVisible(LINKS[1]!, state)).toBe(true);
    expect(isLinkRelationVisible(LINKS[2]!, state)).toBe(false);
  });
});

describe('isCommunityVisible', () => {
  it('is visible unless explicitly hidden', () => {
    expect(isCommunityVisible('graph', defaultFilterState())).toBe(true);
    const hidden = { hiddenCommunities: new Set(['graph']) };
    expect(isCommunityVisible('graph', hidden)).toBe(false);
    expect(isCommunityVisible('core', hidden)).toBe(true);
  });
});

describe('isLinkVisible', () => {
  it('hides an otherwise-visible link when either endpoint community is hidden', () => {
    const state = { ...defaultFilterState(), relations: new Set(['calls']) };
    expect(isLinkVisible(LINKS[0]!, 'core', 'core', state)).toBe(true);
    const hiddenTarget = { ...state, hiddenCommunities: new Set(['graph']) };
    expect(isLinkVisible(LINKS[0]!, 'core', 'graph', hiddenTarget)).toBe(false);
  });
});

describe('searchMatches', () => {
  it('matches case-insensitive substrings of the label', () => {
    expect(searchMatches(NODES, 'usenow')).toEqual(new Set(['a', 'b']));
  });

  it('returns an empty set for a blank query rather than matching everything', () => {
    expect(searchMatches(NODES, '   ')).toEqual(new Set());
  });

  it('returns an empty set when nothing matches', () => {
    expect(searchMatches(NODES, 'nonexistent')).toEqual(new Set());
  });
});

describe('pickFocusNode', () => {
  it('picks the first match in node order, deterministically', () => {
    const matches = searchMatches(NODES, 'usenow');
    expect(pickFocusNode(NODES, matches)).toBe('a');
  });

  it('returns null when there are no matches', () => {
    expect(pickFocusNode(NODES, new Set())).toBeNull();
  });
});

describe('neighborIds', () => {
  it('collects both directions', () => {
    expect(neighborIds('b', LINKS)).toEqual(new Set(['a', 'c']));
  });

  it('is empty for a node with no links', () => {
    expect(neighborIds('ghost', LINKS)).toEqual(new Set());
  });
});

describe('distinctRelations / distinctCommunityNames', () => {
  it('dedupes and sorts', () => {
    expect(distinctRelations(LINKS)).toEqual(['calls', 'imports']);
    expect(distinctCommunityNames(NODES)).toEqual(['core', 'graph']);
  });
});

describe('countVisibleLinks', () => {
  const communityByNodeId = new Map(NODES.map((n) => [n.id, n.communityName]));

  it('counts only links passing the default filter', () => {
    expect(countVisibleLinks(LINKS, communityByNodeId, defaultFilterState())).toBe(1);
  });

  it('counts more once relations widen', () => {
    const state = { ...defaultFilterState(), relations: new Set(['calls', 'imports']) };
    expect(countVisibleLinks(LINKS, communityByNodeId, state)).toBe(3);
  });

  it('skips a link whose endpoint is missing from the community map rather than throwing', () => {
    const state = { ...defaultFilterState(), relations: new Set(['calls', 'imports']) };
    const links = [...LINKS, { source: 'a', target: 'ghost', relation: 'calls', weight: 1, confidence: 1 }];
    expect(countVisibleLinks(links, communityByNodeId, state)).toBe(3);
  });
});
