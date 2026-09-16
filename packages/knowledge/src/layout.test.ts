// Layer: vitest (Phase 82) — pure numeric computation, no browser/GPU capability needed.
import { describe, expect, it } from 'vitest';

import { layoutGraph, runForceAtlas2, toGraphologyGraph } from './layout';
import type { LeanGraph } from './types';

function fixtureGraph(nodeCount = 20): LeanGraph {
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({
    id: `n${i}`,
    label: `Node ${i}`,
    community: i % 3,
    community_name: `community-${i % 3}`,
    file_type: 'code',
  }));
  const links = Array.from({ length: nodeCount - 1 }, (_, i) => ({
    source: `n${i}`,
    target: `n${i + 1}`,
    relation: 'calls',
    weight: 1,
    confidence: 1,
  }));
  return { nodes, links, builtAtCommit: 'deadbeef' };
}

describe('layoutGraph', () => {
  it('is deterministic — two runs on the same input settle at the same coordinates', () => {
    const graph = fixtureGraph();
    const first = layoutGraph(graph, { totalIterations: 40, batchSize: 10 });
    const second = layoutGraph(graph, { totalIterations: 40, batchSize: 10 });
    expect(second).toEqual(first);
  });

  it('produces a finite position for every node', () => {
    const graph = fixtureGraph();
    const positions = layoutGraph(graph, { totalIterations: 20, batchSize: 20 });
    expect(Object.keys(positions)).toHaveLength(graph.nodes.length);
    for (const { x, y } of Object.values(positions)) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    }
  });

  it('reports progress in batches summing to the total', () => {
    const graph = fixtureGraph();
    const reported: Array<{ done: number; total: number }> = [];
    const graphology = toGraphologyGraph(graph);
    // Exercise the callback directly — layoutGraph's own convenience wrapper
    // doesn't accept one, matching runForceAtlas2's role as the callback-aware
    // primitive layout-worker.ts drives.
    runForceAtlas2(graphology, 40, 10, (done: number, total: number) =>
      reported.push({ done, total }),
    );
    expect(reported).toEqual([
      { done: 10, total: 40 },
      { done: 20, total: 40 },
      { done: 30, total: 40 },
      { done: 40, total: 40 },
    ]);
  });

  it('skips a link that references a node absent from the node list, rather than throwing', () => {
    const graph: LeanGraph = {
      nodes: [
        { id: 'a', label: 'A', community: 0, community_name: 'c', file_type: 'code' },
        { id: 'b', label: 'B', community: 0, community_name: 'c', file_type: 'code' },
      ],
      links: [{ source: 'a', target: 'ghost', relation: 'calls', weight: 1, confidence: 1 }],
      builtAtCommit: 'deadbeef',
    };
    expect(() => layoutGraph(graph, { totalIterations: 5, batchSize: 5 })).not.toThrow();
  });
});
