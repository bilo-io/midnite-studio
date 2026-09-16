// Layer: vitest — pure data, no canvas (see knowledge-community-collapse.ts).
import { describe, expect, it } from 'vitest';

import {
  aggregateCommunityEdges,
  communityCentroids,
  communityNameFromNodeId,
  communityNodeId,
  isAggregatedEdgeVisible,
  isCommunityNodeId,
  nodesByCommunity,
  sizeForMemberCount,
} from './knowledge-community-collapse';
import { defaultFilterState } from './knowledge-filters';

const nodes = [
  { id: 'a', label: 'a', community: 0, communityName: 'core', fileType: 'code' },
  { id: 'b', label: 'b', community: 0, communityName: 'core', fileType: 'code' },
  { id: 'c', label: 'c', community: 1, communityName: 'edge', fileType: 'code' },
  { id: 'd', label: 'd', community: 2, communityName: 'outer', fileType: 'code' },
];
const positions = {
  a: { x: 0, y: 0 },
  b: { x: 10, y: 20 },
  c: { x: 100, y: 0 },
  d: { x: -50, y: -50 },
};
const links = [
  { source: 'a', target: 'b', relation: 'calls', weight: 1, confidence: 1 },
  { source: 'a', target: 'c', relation: 'calls', weight: 0.5, confidence: 1 },
  { source: 'b', target: 'c', relation: 'imports', weight: 1, confidence: 0.8 },
  { source: 'c', target: 'd', relation: 'calls', weight: 1, confidence: 1 },
];
const communityByNodeId = new Map(nodes.map((n) => [n.id, n.communityName]));

describe('community node ids', () => {
  it('round-trip through a recognisable prefix', () => {
    const id = communityNodeId('core');
    expect(isCommunityNodeId(id)).toBe(true);
    expect(communityNameFromNodeId(id)).toBe('core');
  });

  it('an ordinary node id is not a community id', () => {
    expect(isCommunityNodeId('a')).toBe(false);
    expect(communityNameFromNodeId('a')).toBeNull();
  });

  it('keeps a community name that itself contains a colon intact', () => {
    expect(communityNameFromNodeId(communityNodeId('a:b'))).toBe('a:b');
  });
});

describe('communityCentroids', () => {
  it('averages member positions and counts members', () => {
    const centroids = communityCentroids(nodes, positions);
    expect(centroids.get('core')).toEqual({ x: 5, y: 10, count: 2, community: 0 });
    expect(centroids.get('edge')).toEqual({ x: 100, y: 0, count: 1, community: 1 });
  });

  it('treats a node with no layout position as the origin rather than dropping it', () => {
    const centroids = communityCentroids(nodes, { a: { x: 10, y: 10 } });
    expect(centroids.get('core')).toEqual({ x: 5, y: 5, count: 2, community: 0 });
  });
});

describe('sizeForMemberCount', () => {
  it('grows with the sqrt of the count and clamps', () => {
    expect(sizeForMemberCount(0)).toBe(6);
    expect(sizeForMemberCount(4)).toBeCloseTo(8.4);
    expect(sizeForMemberCount(10_000)).toBe(26);
  });
});

describe('aggregateCommunityEdges', () => {
  it('is empty when nothing is collapsed', () => {
    expect(aggregateCommunityEdges(links, communityByNodeId, new Set())).toEqual([]);
  });

  it('folds a collapsed community’s outgoing links into one edge per other endpoint', () => {
    const edges = aggregateCommunityEdges(links, communityByNodeId, new Set(['core']));
    expect(edges).toHaveLength(1);
    const [edge] = edges;
    expect(edge).toMatchObject({
      key: 'community:core|c',
      source: 'community:core',
      target: 'c',
      relations: ['calls', 'imports'],
      weight: 1,
      confidence: 1,
      count: 2,
    });
  });

  it('drops links that stay inside one collapsed community', () => {
    const edges = aggregateCommunityEdges(links, communityByNodeId, new Set(['core']));
    expect(edges.some((e) => e.source === e.target)).toBe(false);
    // a→b was the only intra-core link; c→d touches no collapsed community.
    expect(edges.map((e) => e.key)).toEqual(['community:core|c']);
  });

  it('re-points at the other community’s meta-node once it is collapsed too', () => {
    const edges = aggregateCommunityEdges(links, communityByNodeId, new Set(['core', 'edge']));
    expect(edges.map((e) => e.key).sort()).toEqual(['community:core|community:edge', 'community:edge|d']);
  });

  it('keeps direction: a link INTO a collapsed community targets its meta-node', () => {
    const edges = aggregateCommunityEdges(links, communityByNodeId, new Set(['outer']));
    expect(edges).toEqual([
      expect.objectContaining({ source: 'c', target: 'community:outer', count: 1 }),
    ]);
  });

  it('ignores a link whose endpoint is unknown to the community map', () => {
    const edges = aggregateCommunityEdges(
      [{ source: 'a', target: 'ghost', relation: 'calls', weight: 1, confidence: 1 }],
      communityByNodeId,
      new Set(['core']),
    );
    expect(edges).toEqual([
      expect.objectContaining({ source: 'community:core', target: 'ghost' }),
    ]);
  });
});

describe('isAggregatedEdgeVisible', () => {
  const edge = { relations: ['calls', 'imports'], weight: 0.5, confidence: 0.8 };

  it('is visible when ANY folded relation is enabled', () => {
    const state = { ...defaultFilterState(), relations: new Set(['imports']) };
    expect(isAggregatedEdgeVisible(edge, 'core', 'edge', state)).toBe(true);
  });

  it('is hidden when none of the folded relations is enabled', () => {
    const state = { ...defaultFilterState(), relations: new Set(['inherits']) };
    expect(isAggregatedEdgeVisible(edge, 'core', 'edge', state)).toBe(false);
  });

  it('honours the weight and confidence sliders and hidden communities', () => {
    expect(isAggregatedEdgeVisible(edge, 'core', 'edge', { ...defaultFilterState(), minWeight: 0.6 })).toBe(false);
    expect(isAggregatedEdgeVisible(edge, 'core', 'edge', { ...defaultFilterState(), minConfidence: 0.9 })).toBe(false);
    expect(
      isAggregatedEdgeVisible(edge, 'core', 'edge', {
        ...defaultFilterState(),
        hiddenCommunities: new Set(['edge']),
      }),
    ).toBe(false);
  });
});

describe('nodesByCommunity', () => {
  it('groups in input order', () => {
    const grouped = nodesByCommunity(nodes);
    expect([...grouped.keys()]).toEqual(['core', 'edge', 'outer']);
    expect(grouped.get('core')?.map((n) => n.id)).toEqual(['a', 'b']);
  });
});
