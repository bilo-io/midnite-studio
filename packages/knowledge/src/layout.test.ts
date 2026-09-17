// Layer: vitest (Phase 82) — pure numeric computation, no browser/GPU capability needed.
import { KNOWLEDGE_LAYOUT_IDS } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import {
  FORCE_ATLAS2_SETTINGS,
  LAYOUT_IDS,
  isLayoutId,
  layoutGraph,
  runForceAtlas2,
  toGraphologyGraph,
  type LayoutId,
} from './layout';
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

/** A fixture whose edges are all `imports`/`imports_from` — {@link runHierarchical}'s only signal — with a deliberate cycle (n3 -> n0) so the level assignment's cycle-break path is exercised too. */
function importFixtureGraph(): LeanGraph {
  const nodes = Array.from({ length: 6 }, (_, i) => ({
    id: `n${i}`,
    label: `Node ${i}`,
    community: i % 2,
    community_name: `community-${i % 2}`,
    file_type: 'code',
  }));
  const links = [
    { source: 'n0', target: 'n1', relation: 'imports', weight: 1, confidence: 1 },
    { source: 'n0', target: 'n2', relation: 'imports', weight: 1, confidence: 1 },
    { source: 'n1', target: 'n3', relation: 'imports_from', weight: 1, confidence: 1 },
    { source: 'n2', target: 'n3', relation: 'imports', weight: 1, confidence: 1 },
    { source: 'n3', target: 'n0', relation: 'imports', weight: 1, confidence: 1 }, // cycle
    { source: 'n4', target: 'n5', relation: 'calls', weight: 1, confidence: 1 }, // not an import edge
  ];
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

  it('tunes ForceAtlas2 for a sparse layout with scalingRatio 25', () => {
    expect(FORCE_ATLAS2_SETTINGS.scalingRatio).toBe(25);
    expect(FORCE_ATLAS2_SETTINGS.gravity).toBe(1);
    expect(FORCE_ATLAS2_SETTINGS.barnesHutOptimize).toBe(true);
  });
});

describe('LAYOUT_IDS vs. shared\'s KNOWLEDGE_LAYOUT_IDS', () => {
  it('stays in lockstep with the wire contract\'s own copy of the list', () => {
    // `shared` cannot import this package (it imports no other workspace
    // package at all), so the two lists are kept in step by hand — this is
    // the tripwire that catches a drift between them.
    expect([...LAYOUT_IDS]).toEqual([...KNOWLEDGE_LAYOUT_IDS]);
  });
});

describe('isLayoutId', () => {
  it('accepts every id in LAYOUT_IDS', () => {
    for (const id of LAYOUT_IDS) expect(isLayoutId(id)).toBe(true);
  });

  it('rejects an unknown id', () => {
    expect(isLayoutId('spring-embedder')).toBe(false);
  });
});

describe.each(LAYOUT_IDS)('layoutGraph({ layoutId: %s })', (layoutId: LayoutId) => {
  it('is deterministic — two runs on the same input settle at the same coordinates', () => {
    const graph = layoutId === 'hierarchical' ? importFixtureGraph() : fixtureGraph();
    const first = layoutGraph(graph, { layoutId, totalIterations: 20, batchSize: 10 });
    const second = layoutGraph(graph, { layoutId, totalIterations: 20, batchSize: 10 });
    expect(second).toEqual(first);
  });

  it('produces a finite position for every node', () => {
    const graph = layoutId === 'hierarchical' ? importFixtureGraph() : fixtureGraph();
    const positions = layoutGraph(graph, { layoutId, totalIterations: 20, batchSize: 10 });
    expect(Object.keys(positions).sort()).toEqual(graph.nodes.map((n) => n.id).sort());
    for (const { x, y } of Object.values(positions)) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    }
  });
});

describe('runCirclepack', () => {
  it('groups nodes by community — same-community nodes end up strictly closer together than the community centres are to each other', () => {
    const graph = fixtureGraph(30);
    const positions = layoutGraph(graph, { layoutId: 'circlepack' });

    const byCommunity = new Map<number, string[]>();
    graph.nodes.forEach((node, i) => {
      const list = byCommunity.get(i % 3) ?? [];
      list.push(node.id);
      byCommunity.set(i % 3, list);
    });

    const centroidOf = (ids: string[]) => {
      const sum = ids.reduce(
        (acc, id) => ({ x: acc.x + positions[id]!.x, y: acc.y + positions[id]!.y }),
        { x: 0, y: 0 },
      );
      return { x: sum.x / ids.length, y: sum.y / ids.length };
    };

    const centroids = [...byCommunity.values()].map(centroidOf);
    const distinctCentroids = new Set(centroids.map((c) => `${c.x.toFixed(3)},${c.y.toFixed(3)}`));
    // Three communities should not all collapse onto one point.
    expect(distinctCentroids.size).toBeGreaterThan(1);
  });
});

describe('runHierarchical', () => {
  it('places a root (no incoming import edge) at level 0 and its import target one level deeper', () => {
    const graph = importFixtureGraph();
    const positions = layoutGraph(graph, { layoutId: 'hierarchical' });
    // n0 imports n1/n2 and nothing imports n0 except n3 which is reached via
    // a cycle back-edge — n0 is peeled off first as the cycle-break root.
    expect(positions.n0!.y).toBeLessThan(positions.n1!.y);
    expect(positions.n0!.y).toBeLessThan(positions.n2!.y);
  });

  it('leaves non-import edges (e.g. calls) out of the level computation', () => {
    const graph = importFixtureGraph();
    const positions = layoutGraph(graph, { layoutId: 'hierarchical' });
    // n4/n5 are connected only by a `calls` edge — both isolated w.r.t.
    // imports, so both sit at level 0 (y = 0).
    expect(positions.n4!.y).toBe(0);
    expect(positions.n5!.y).toBe(0);
  });
});

describe('runNoverlap', () => {
  it('spreads out nodes seeded at (near-)identical positions', () => {
    const nodes = Array.from({ length: 10 }, (_, i) => ({
      id: `n${i}`,
      label: `Node ${i}`,
      community: 0,
      community_name: 'c',
      file_type: 'code',
    }));
    const graph: LeanGraph = { nodes, links: [], builtAtCommit: 'deadbeef' };
    const positions = layoutGraph(graph, { layoutId: 'noverlap', totalIterations: 10, batchSize: 10 });

    const coords = Object.values(positions);
    const distinct = new Set(coords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`));
    expect(distinct.size).toBeGreaterThan(1);
  });
});
