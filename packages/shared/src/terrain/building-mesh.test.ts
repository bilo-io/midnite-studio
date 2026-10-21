import { describe, expect, it } from 'vitest';

import { BUILDING_SINK_M, buildingsMesh } from './building-mesh';

describe('buildingsMesh', () => {
  it('extrudes a square into four walls and a two-triangle roof', () => {
    const mesh = buildingsMesh([{ polygon: [[0, 0], [10, 0], [10, 10], [0, 10]], baseY: 2, height: 6 }]);
    expect(mesh.indices.length / 3).toBe(4 * 2 + 2);
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 1; i < mesh.positions.length; i += 3) {
      minY = Math.min(minY, mesh.positions[i]!);
      maxY = Math.max(maxY, mesh.positions[i]!);
    }
    expect(minY).toBe(2 - BUILDING_SINK_M);
    expect(maxY).toBe(8);
  });

  it('winds every face to agree with its normal, whichever way the footprint is wound', () => {
    for (const polygon of [
      [[0, 0], [10, 0], [10, 10], [0, 10]],
      [[0, 0], [0, 10], [10, 10], [10, 0]],
    ] as [number, number][][]) {
      const mesh = buildingsMesh([{ polygon, baseY: 0, height: 5 }]);
      for (let t = 0; t < mesh.indices.length; t += 3) {
        const p = (k: number): number[] => Array.from(mesh.positions.slice(mesh.indices[t + k]! * 3, mesh.indices[t + k]! * 3 + 3));
        const [a, b, c] = [p(0), p(1), p(2)];
        const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
        const v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
        const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
        const i = mesh.indices[t]! * 3;
        const dot = n[0]! * mesh.normals[i]! + n[1]! * mesh.normals[i + 1]! + n[2]! * mesh.normals[i + 2]!;
        expect(dot).toBeGreaterThan(0);
      }
      // Wall normals point away from the footprint's centre.
      const nx = mesh.normals[0]!;
      const nz = mesh.normals[2]!;
      const mx = (mesh.positions[0]! + mesh.positions[3]!) / 2 - 5;
      const mz = (mesh.positions[2]! + mesh.positions[5]!) / 2 - 5;
      expect(nx * mx + nz * mz).toBeGreaterThan(0);
    }
  });
});
