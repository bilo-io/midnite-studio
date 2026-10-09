import { describe, expect, it } from 'vitest';

import type { TerrainRoadsFile } from '../media-terrain';
import type { Heightfield } from './heightfield';
import { ROAD_MESH_LIFT_M, roadMeshes } from './road-mesh';

const field: Heightfield = { resolution: 65, worldSize: 128, heights: new Float32Array(65 * 65).fill(5) };

const plus: TerrainRoadsFile = {
  version: 1,
  nodes: [
    { id: 0, p: [0, 5, 0], degree: 4 },
    { id: 1, p: [50, 5, 0], degree: 1 },
    { id: 2, p: [-50, 5, 0], degree: 1 },
    { id: 3, p: [0, 5, 50], degree: 1 },
    { id: 4, p: [0, 5, -50], degree: 1 },
  ],
  edges: [1, 2, 3, 4].map((b, i) => ({
    id: i,
    a: 0,
    b,
    points: [[0, 5, 0], [i < 2 ? (b === 1 ? 50 : -50) : 0, 5, i < 2 ? 0 : b === 3 ? 50 : -50]] as [number, number, number][],
    widthM: 8,
    kind: 'street' as const,
    lengthM: 50,
  })),
};

describe('roadMeshes', () => {
  const parts = roadMeshes(plus, field);

  it('makes a ribbon per edge and a patch per junction', () => {
    expect(parts.filter((p) => p.name.startsWith('road-'))).toHaveLength(4);
    expect(parts.filter((p) => p.name.startsWith('junction-'))).toHaveLength(1);
  });

  it('sits the ribbon just above the ground, as wide as the road, with every face up', () => {
    const ribbon = parts[0]!;
    for (let i = 1; i < ribbon.positions.length; i += 3) expect(ribbon.positions[i]).toBeCloseTo(5 + ROAD_MESH_LIFT_M, 5);
    const [x0, , z0] = ribbon.positions;
    const [x1, , z1] = ribbon.positions.slice(3, 6);
    expect(Math.hypot(x1! - x0!, z1! - z0!)).toBeCloseTo(8, 5);
    for (const part of parts) {
      for (let t = 0; t < part.indices.length; t += 3) {
        const p = (k: number): number[] => Array.from(part.positions.slice(part.indices[t + k]! * 3, part.indices[t + k]! * 3 + 3));
        const [a, b, c] = [p(0), p(1), p(2)];
        const ny = (b[2]! - a[2]!) * (c[0]! - a[0]!) - (b[0]! - a[0]!) * (c[2]! - a[2]!);
        expect(ny).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('runs V along the road in widths and U across it', () => {
    const ribbon = parts[0]!;
    expect([ribbon.uvs[0], ribbon.uvs[2]]).toEqual([0, 1]);
    const lastV = ribbon.uvs[ribbon.uvs.length - 1]!;
    expect(lastV).toBeGreaterThan(4);
  });
});
