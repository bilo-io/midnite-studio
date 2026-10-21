import { describe, expect, it } from 'vitest';

import { decimateMesh } from './decimate';
import { cube, flatGrid, isClosedManifold, uvSphere } from './pipeline-fixtures';

describe('decimateMesh', () => {
  it('hits its triangle target and keeps a closed mesh closed', () => {
    const sphere = uvSphere(1, 32, 16);
    const faces = sphere.indices.length / 3;
    const out = decimateMesh(sphere, { targetTriangles: Math.round(faces / 3) });
    expect(out.reachedTarget).toBe(true);
    expect(out.after).toBeLessThanOrEqual(Math.round(faces / 3));
    expect(out.after).toBeGreaterThan(faces / 3 - 6);
    expect(isClosedManifold(out.indices)).toBe(true);
    // The silhouette survives: every vertex still sits near the unit sphere.
    for (let v = 0; v < out.positions.length; v += 3) expect(Math.hypot(out.positions[v]!, out.positions[v + 1]!, out.positions[v + 2]!)).toBeGreaterThan(0.85);
  });

  it('takes a ratio, and never goes below a tetrahedron', () => {
    const sphere = uvSphere(1, 24, 12);
    const half = decimateMesh(sphere, { ratio: 0.5 });
    expect(half.after).toBeLessThanOrEqual(sphere.indices.length / 3 / 2);
    expect(decimateMesh(cube(), { targetTriangles: 1 }).after).toBeGreaterThanOrEqual(4);
  });

  it('keeps open borders where they were', () => {
    const grid = flatGrid(12);
    const out = decimateMesh(grid, { targetTriangles: 60 });
    expect(out.after).toBeLessThan(grid.indices.length / 3);
    expect(out.borderVertices).toBe(48);
    // Every original corner of the sheet is still a vertex.
    const corners = new Set<string>();
    for (let v = 0; v < out.positions.length; v += 3) corners.add(`${out.positions[v]},${out.positions[v + 2]}`);
    for (const c of ['-0.5,-0.5', '0.5,-0.5', '-0.5,0.5', '0.5,0.5']) expect(corners.has(c)).toBe(true);
  });

  it('carries uvs and groups through the collapse', () => {
    const grid = flatGrid(8);
    const n = grid.positions.length / 3;
    const uvs = new Float32Array(n * 2);
    const groups = new Uint16Array(n);
    for (let v = 0; v < n; v += 1) {
      uvs[v * 2] = grid.positions[v * 3]! + 0.5;
      uvs[v * 2 + 1] = grid.positions[v * 3 + 2]! + 0.5;
      groups[v] = grid.positions[v * 3]! > 0 ? 1 : 0;
    }
    const out = decimateMesh({ ...grid, uvs, groups }, { targetTriangles: 40 });
    expect(out.uvs).toHaveLength((out.positions.length / 3) * 2);
    expect(out.groups).toHaveLength(out.positions.length / 3);
    // On a planar sheet the uv stays an affine function of the position, so interpolation was right.
    for (let v = 0; v < out.positions.length / 3; v += 1) {
      expect(out.uvs![v * 2]!).toBeCloseTo(out.positions[v * 3]! + 0.5, 4);
      expect(out.uvs![v * 2 + 1]!).toBeCloseTo(out.positions[v * 3 + 2]! + 0.5, 4);
    }
  });
});
