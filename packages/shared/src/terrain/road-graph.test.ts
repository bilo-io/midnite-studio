import { describe, expect, it } from 'vitest';

import type { Heightfield } from './heightfield';
import { joinDegree2, pruneSpurs, roadGraphFromMask, roadKind, sampleCatmullRom, toRoadsFile, type RoadGraph } from './road-graph';
import { extractRoadMask } from './road-mask';
import { paintedMask, paintedRaster } from './road-test-fixtures';

const flat = (res: number, worldSize: number, h = 0): Heightfield => ({ resolution: res, worldSize, heights: new Float32Array(res * res).fill(h) });
const OPTS = { spurMinM: 8, widthClampM: [2, 30] as const };

describe('road graph', () => {
  it('a straight 10 px cyan line at 1 m/px is one edge about 10 m wide', () => {
    const img = paintedRaster(128, (x, y) => x >= 8 && x < 120 && y >= 59 && y < 69);
    const mask = extractRoadMask(img, '#00ffff', 0.25);
    const { graph, mPerPx } = roadGraphFromMask(mask, 128, { worldSize: 128, ...OPTS });
    expect(graph.edges).toHaveLength(1);
    const file = toRoadsFile(graph, flat(129, 128), { mPerPx, widthScale: 1, widthClampM: OPTS.widthClampM });
    expect(file.edges[0]!.widthM).toBeGreaterThanOrEqual(9);
    expect(file.edges[0]!.widthM).toBeLessThanOrEqual(11);
    expect(file.edges[0]!.lengthM).toBeGreaterThan(90);
    expect(file.nodes.every((n) => n.degree === 1)).toBe(true);
  });

  it('a plus-shaped mask yields one 4-way junction', () => {
    const plus = paintedMask(128, (x, y) => (x >= 59 && x < 69 && y >= 8 && y < 120) || (y >= 59 && y < 69 && x >= 8 && x < 120));
    const { graph } = roadGraphFromMask(plus, 128, { worldSize: 128, ...OPTS });
    const file = toRoadsFile(graph, flat(129, 128), { mPerPx: 1, widthScale: 1, widthClampM: OPTS.widthClampM });
    const junctions = file.nodes.filter((n) => n.degree >= 3);
    expect(junctions).toHaveLength(1);
    expect(junctions[0]!.degree).toBe(4);
    expect(file.edges).toHaveLength(4);
    // The junction sits at the crossing.
    expect(Math.abs(junctions[0]!.p[0])).toBeLessThan(3);
    expect(Math.abs(junctions[0]!.p[2])).toBeLessThan(3);
  });

  it('prunes spurs below the threshold and joins the pass-through', () => {
    const g: RoadGraph = {
      nodes: [
        { id: 0, x: 0, z: 0 },
        { id: 1, x: 50, z: 0 },
        { id: 2, x: 100, z: 0 },
        { id: 3, x: 50, z: 5 },
      ],
      edges: [
        { id: 0, a: 0, b: 1, path: [[0, 0], [50, 0]], radii: [3] },
        { id: 1, a: 1, b: 2, path: [[50, 0], [100, 0]], radii: [3] },
        { id: 2, a: 1, b: 3, path: [[50, 0], [50, 5]], radii: [1] },
      ],
    };
    const pruned = pruneSpurs(g, 8);
    expect(pruned.edges).toHaveLength(1);
    expect(pruned.nodes.map((n) => n.id).sort()).toEqual([0, 2]);
    expect(pruned.edges[0]!.path).toHaveLength(3);
    // A long branch survives.
    expect(pruneSpurs(g, 4).edges).toHaveLength(3);
    expect(joinDegree2(g).edges).toHaveLength(3);
  });

  it('a mask with no road pixels is an empty graph, not an error', () => {
    const { graph } = roadGraphFromMask(new Uint8Array(64 * 64), 64, { worldSize: 64, ...OPTS });
    expect(graph).toEqual({ nodes: [], edges: [] });
  });

  it('classifies kind by width and samples splines through their control points', () => {
    expect([roadKind(3), roadKind(6), roadKind(12)]).toEqual(['path', 'street', 'avenue']);
    const pts = sampleCatmullRom<[number, number]>([[0, 0], [10, 0], [20, 10]], 2);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1]).toEqual([20, 10]);
    expect(pts.some(([x, z]) => x === 10 && z === 0)).toBe(true);
  });
});
