// Layer: vitest — pure ranking/budget math, no canvas involved.
import { describe, expect, it } from 'vitest';

import { computeDegrees } from './knowledge-degree';
import {
  DEFAULT_DETAIL_ID,
  DETAIL_LEVELS,
  formatNodeCount,
  linkIndexByNode,
  mountedNodeCount,
  offeredDetailLevels,
  rankNodesByDegree,
  resolveDetailLevel,
  selectCoreNodeIds,
} from './knowledge-detail';

const links = [
  { source: 'hub', target: 'a' },
  { source: 'hub', target: 'b' },
  { source: 'hub', target: 'c' },
  { source: 'a', target: 'b' },
  { source: 'leaf', target: 'c' },
];
const nodes = ['leaf', 'c', 'b', 'a', 'hub', 'island'].map((id) => ({ id }));

describe('knowledge-detail', () => {
  it('the default level is the smallest budget, and an unknown id falls back to it', () => {
    expect(DEFAULT_DETAIL_ID).toBe('core');
    expect(resolveDetailLevel('nope')).toBe(DETAIL_LEVELS[0]);
    expect(resolveDetailLevel('all').maxNodes).toBe(Number.POSITIVE_INFINITY);
  });

  it('ranks by degree descending, ties by id', () => {
    const degrees = computeDegrees(links);
    expect(rankNodesByDegree(nodes, degrees).map((n) => n.id)).toEqual([
      'hub', // 3
      'a', // 2
      'b', // 2
      'c', // 2
      'leaf', // 1
      'island', // 0
    ]);
  });

  it('selects the top-N by degree, or null when everything fits', () => {
    const degrees = computeDegrees(links);
    expect(selectCoreNodeIds(nodes, degrees, 6)).toBeNull();
    expect(selectCoreNodeIds(nodes, degrees, 100)).toBeNull();
    expect([...selectCoreNodeIds(nodes, degrees, 2)!]).toEqual(['hub', 'a']);
  });

  it('offers only the levels a graph can tell apart', () => {
    expect(offeredDetailLevels(800).map((l) => l.id)).toEqual(['core']);
    expect(offeredDetailLevels(1_500).map((l) => l.id)).toEqual(['core']);
    expect(offeredDetailLevels(1_501).map((l) => l.id)).toEqual(['core', 'extended']);
    expect(offeredDetailLevels(15_292).map((l) => l.id)).toEqual(['core', 'extended', 'all']);
  });

  it('reports how many nodes a level mounts for a given graph', () => {
    expect(mountedNodeCount(15_292, resolveDetailLevel('core'))).toBe(1_500);
    expect(mountedNodeCount(15_292, resolveDetailLevel('all'))).toBe(15_292);
    expect(mountedNodeCount(800, resolveDetailLevel('extended'))).toBe(800);
  });

  it('formats node counts the way the pills read them', () => {
    expect(formatNodeCount(840)).toBe('840');
    expect(formatNodeCount(1_500)).toBe('1.5k');
    expect(formatNodeCount(5_000)).toBe('5k');
    expect(formatNodeCount(15_292)).toBe('15.3k');
    expect(formatNodeCount(120_000)).toBe('120k');
  });

  it('indexes links by both endpoints, a self-loop once', () => {
    const index = linkIndexByNode([...links, { source: 'x', target: 'x' }]);
    expect(index.get('hub')).toEqual([0, 1, 2]);
    expect(index.get('c')).toEqual([2, 4]);
    expect(index.get('x')).toEqual([5]);
    expect(index.get('island')).toBeUndefined();
  });
});
