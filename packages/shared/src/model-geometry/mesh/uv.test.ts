import { describe, expect, it } from 'vitest';

import { cube, flatGrid, uvSphere } from './pipeline-fixtures';
import { unwrapMesh, weldVertices } from './uv';

/** Charts as connected sets of triangles sharing split vertices; returns each chart's uv bounding box. */
function chartBoxes(out: ReturnType<typeof unwrapMesh>): { minX: number; minY: number; maxX: number; maxY: number }[] {
  const parent = Array.from({ length: out.positions.length / 3 }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]!]!;
    return x;
  };
  for (let f = 0; f < out.indices.length; f += 3) {
    parent[find(out.indices[f + 1]!)] = find(out.indices[f]!);
    parent[find(out.indices[f + 2]!)] = find(out.indices[f]!);
  }
  const boxes = new Map<number, { minX: number; minY: number; maxX: number; maxY: number }>();
  for (let v = 0; v < out.positions.length / 3; v += 1) {
    const r = find(v);
    const box = boxes.get(r) ?? { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    box.minX = Math.min(box.minX, out.uvs[v * 2]!);
    box.maxX = Math.max(box.maxX, out.uvs[v * 2]!);
    box.minY = Math.min(box.minY, out.uvs[v * 2 + 1]!);
    box.maxY = Math.max(box.maxY, out.uvs[v * 2 + 1]!);
    boxes.set(r, box);
  }
  return [...boxes.values()];
}

const overlap = (a: ReturnType<typeof chartBoxes>[number], b: ReturnType<typeof chartBoxes>[number]): boolean =>
  a.minX < b.maxX - 1e-9 && b.minX < a.maxX - 1e-9 && a.minY < b.maxY - 1e-9 && b.minY < a.maxY - 1e-9;

describe('unwrapMesh', () => {
  it('splits a cube into six charts inside [0,1] with no overlap', () => {
    const out = unwrapMesh(cube(), { textureSize: 512 });
    expect(out.charts).toBe(6);
    for (const uv of out.uvs) {
      expect(uv).toBeGreaterThanOrEqual(-1e-6);
      expect(uv).toBeLessThanOrEqual(1 + 1e-6);
    }
    const boxes = chartBoxes(out);
    expect(boxes).toHaveLength(6);
    for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) expect(overlap(boxes[i]!, boxes[j]!)).toBe(false);
    expect(out.density.mean).toBeGreaterThan(0);
    expect(out.indices).toHaveLength(36);
  });

  it('unwraps a sphere with few charts, even density and no flipped triangles', () => {
    const sphere = uvSphere(1, 24, 12);
    const out = unwrapMesh(sphere, { textureSize: 1024 });
    expect(out.charts).toBeGreaterThanOrEqual(2);
    expect(out.charts).toBeLessThan(30);
    const boxes = chartBoxes(out);
    for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) expect(overlap(boxes[i]!, boxes[j]!)).toBe(false);
    let positive = 0;
    let negative = 0;
    for (let f = 0; f < out.indices.length; f += 3) {
      const [a, b, c] = [out.indices[f]!, out.indices[f + 1]!, out.indices[f + 2]!];
      const area = (out.uvs[b * 2]! - out.uvs[a * 2]!) * (out.uvs[c * 2 + 1]! - out.uvs[a * 2 + 1]!) - (out.uvs[b * 2 + 1]! - out.uvs[a * 2 + 1]!) * (out.uvs[c * 2]! - out.uvs[a * 2]!);
      if (area > 0) positive += 1;
      else negative += 1;
    }
    expect(Math.min(positive, negative) / (positive + negative)).toBeLessThan(0.02);
    expect(out.density.max / out.density.min).toBeLessThan(6);
  });

  it('keeps one chart for a flat sheet and carries source vertices and groups', () => {
    const grid = flatGrid(6);
    const groups = new Uint16Array(grid.positions.length / 3).map((_, v) => v % 3);
    const out = unwrapMesh({ ...grid, groups });
    expect(out.charts).toBe(1);
    expect(out.source).toHaveLength(out.positions.length / 3);
    for (let v = 0; v < out.source.length; v += 1) expect(out.groups![v]).toBe(groups[out.source[v]!]);
  });

  it('welds the seams back together', () => {
    const c = cube();
    const out = unwrapMesh(c);
    expect(out.positions.length / 3).toBeGreaterThan(8);
    const welded = weldVertices(out);
    expect(welded.positions.length / 3).toBe(8);
    expect(welded.indices).toHaveLength(36);
  });
});
