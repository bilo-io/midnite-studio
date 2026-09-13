import { describe, expect, it } from 'vitest';
import { aggregateHeapSnapshot, diffHeapSnapshots, linearFit } from './memory-report.mjs';

function buildSyntheticSnapshot(items, edgesList = []) {
  // node_fields: type (0), name (1), id (2), self_size (3), edge_count (4)
  const meta = {
    node_fields: ['type', 'name', 'id', 'self_size', 'edge_count'],
    node_types: [
      ['hidden', 'array', 'string', 'object'],
      'string',
      'number',
      'number',
      'number',
    ],
    edge_fields: ['type', 'name_or_index', 'to_node'],
    edge_types: [['context', 'element', 'property', 'internal', 'hidden']],
  };

  const strings = [];
  const nodes = [];

  let idCounter = 1;
  for (const { type = 3, name, count, selfSize, edgeCount = 0 } of items) {
    let nameIndex = strings.indexOf(name);
    if (nameIndex === -1) {
      nameIndex = strings.length;
      strings.push(name);
    }
    for (let i = 0; i < count; i += 1) {
      nodes.push(type, nameIndex, idCounter++, selfSize, edgeCount);
    }
  }

  return {
    snapshot: {
      meta,
      node_count: nodes.length / 5,
      edge_count: edgesList.length / 3,
    },
    nodes,
    edges: edgesList,
    strings,
  };
}

describe('aggregateHeapSnapshot', () => {
  it('aggregates counts and self_size by constructor name', () => {
    const snap = buildSyntheticSnapshot([
      { type: 3, name: 'Array', count: 5, selfSize: 100 },
      { type: 3, name: 'Object', count: 3, selfSize: 50 },
    ]);

    const agg = aggregateHeapSnapshot(snap);
    expect(agg.get('Array')).toEqual({ count: 5, selfSize: 500 });
    expect(agg.get('Object')).toEqual({ count: 3, selfSize: 150 });
  });

  it('skips V8 internal hidden and system nodes', () => {
    const snap = buildSyntheticSnapshot([
      { type: 3, name: 'LeakyRetainer', count: 1, selfSize: 200 },
      { type: 0, name: '(object elements)', count: 5, selfSize: 1000 },
      { type: 3, name: 'system / Context', count: 2, selfSize: 500 },
    ]);

    const agg = aggregateHeapSnapshot(snap);
    expect(agg.has('LeakyRetainer')).toBe(true);
    expect(agg.has('(object elements)')).toBe(false);
    expect(agg.has('system / Context')).toBe(false);
  });

  it('attributes internal hidden backing store elements to the owning object', () => {
    // Node 0: Array (type 1, selfSize 32, 1 edge)
    // Node 1: (object elements) (type 0, selfSize 10000, 0 edges)
    // Edge 0: type 3 (internal), name_or_index 0, to_node 5 (offset of Node 1)
    const snap = buildSyntheticSnapshot(
      [
        { type: 1, name: 'Array', count: 1, selfSize: 32, edgeCount: 1 },
        { type: 0, name: '(object elements)', count: 1, selfSize: 10_000, edgeCount: 0 },
      ],
      [3, 0, 5],
    );

    const agg = aggregateHeapSnapshot(snap);
    expect(agg.get('Array')).toEqual({ count: 1, selfSize: 10_032 });
    expect(agg.has('(object elements)')).toBe(false);
  });

  it('handles empty or malformed snapshots gracefully', () => {
    expect(aggregateHeapSnapshot(null).size).toBe(0);
    expect(aggregateHeapSnapshot({}).size).toBe(0);
  });
});

describe('diffHeapSnapshots', () => {
  it('reports top retained constructors by delta self_size', () => {
    const snap1 = buildSyntheticSnapshot([
      { type: 3, name: 'StableObject', count: 10, selfSize: 100 },
      { type: 3, name: 'LeakyRetainer', count: 1, selfSize: 10_000 },
    ]);

    const snap2 = buildSyntheticSnapshot([
      { type: 3, name: 'StableObject', count: 10, selfSize: 100 },
      { type: 3, name: 'LeakyRetainer', count: 20, selfSize: 10_000 },
      { type: 3, name: 'MinorLeak', count: 2, selfSize: 500 },
    ]);

    const diff = diffHeapSnapshots(snap1, snap2);
    expect(diff.length).toBeGreaterThanOrEqual(2);

    // Top retained must be LeakyRetainer
    expect(diff[0].constructor).toBe('LeakyRetainer');
    expect(diff[0].deltaCount).toBe(19);
    expect(diff[0].deltaSize).toBe(190_000);

    // Second retained is MinorLeak
    expect(diff[1].constructor).toBe('MinorLeak');
    expect(diff[1].deltaCount).toBe(2);
    expect(diff[1].deltaSize).toBe(1_000);

    // StableObject has zero delta so it is not in the retained list
    expect(diff.find((d) => d.constructor === 'StableObject')).toBeUndefined();
  });
});

describe('linearFit', () => {
  it('computes exact linear fit for collinear points', () => {
    const points = [
      { t: 0, value: 100 },
      { t: 60, value: 160 },
      { t: 120, value: 220 },
    ];
    const fit = linearFit(points);
    expect(fit.slopeKbPerSec).toBeCloseTo(1, 5);
    expect(fit.slopeKbPerHour).toBeCloseTo(3600, 5);
    expect(fit.interceptKb).toBeCloseTo(100, 5);
    expect(fit.r2).toBeCloseTo(1, 5);
  });

  it('handles empty or single point series', () => {
    expect(linearFit([])).toEqual({ slopeKbPerSec: 0, slopeKbPerHour: 0, interceptKb: 0, r2: 0 });
    expect(linearFit([{ t: 10, value: 50 }])).toEqual({
      slopeKbPerSec: 0,
      slopeKbPerHour: 0,
      interceptKb: 50,
      r2: 1,
    });
  });
});
