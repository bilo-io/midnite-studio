import { describe, expect, it } from 'vitest';

import { bakeMaps, vertexTangents } from './bake';
import { flatGrid, uvSphere } from './pipeline-fixtures';
import { EditableMesh } from './editable-mesh';

/** A unit sheet with a sine ridge along x: h = 0.05 sin(2πx). */
function bumpedPlane(): { positions: Float32Array; indices: Uint32Array } {
  const grid = flatGrid(96);
  for (let v = 0; v < grid.positions.length; v += 3) grid.positions[v + 1] = 0.05 * Math.sin(2 * Math.PI * grid.positions[v]!);
  return grid;
}

/** Two triangles over the unit square with uv = (x + 0.5, z + 0.5). */
function lowPlane(): { positions: Float32Array; indices: Uint32Array; uvs: Float32Array } {
  const grid = flatGrid(1);
  const uvs = new Float32Array((grid.positions.length / 3) * 2);
  for (let v = 0; v < grid.positions.length / 3; v += 1) {
    uvs[v * 2] = grid.positions[v * 3]! + 0.5;
    uvs[v * 2 + 1] = grid.positions[v * 3 + 2]! + 0.5;
  }
  return { ...grid, uvs };
}

describe('bakeMaps', () => {
  it('reproduces the bump direction in a tangent-space normal map', async () => {
    const baked = await bakeMaps({ high: bumpedPlane(), low: lowPlane(), size: 64, kinds: ['normal'], cage: 0.2, padding: 0 });
    expect(baked.coverage).toBeGreaterThan(0.95);
    expect(baked.hitRate).toBeGreaterThan(0.95);
    const red = (u: number): number => baked.normal![(32 * 64 + Math.floor(u * 64)) * 3]!;
    const green = baked.normal![(32 * 64 + 32) * 3 + 1]!;
    const blue = baked.normal![(32 * 64 + 32) * 3 + 2]!;
    // Rising slope (x = -0.1 .. 0.1) leans the normal toward -x: red below the flat value; falling slope, above.
    expect(red(0.5)).toBeLessThan(110);
    expect(red(0.95)).toBeGreaterThan(146);
    // The crest of the ridge is flat again.
    expect(Math.abs(red(0.75) - 128)).toBeLessThan(12);
    // Nothing leans along z, and the normal still points out of the surface.
    expect(Math.abs(green - 128)).toBeLessThan(6);
    expect(blue).toBeGreaterThan(200);
  });

  it('darkens occlusion in the valley relative to the crest', async () => {
    const baked = await bakeMaps({ high: bumpedPlane(), low: lowPlane(), size: 64, kinds: ['ao'], cage: 0.2, aoSamples: 24, aoDistance: 0.4, padding: 0 });
    const at = (u: number): number => baked.ao![32 * 64 + Math.floor(u * 64)]!;
    // Crest at x = 0.25 (u 0.75), valley at x = -0.25 (u 0.25).
    expect(at(0.25)).toBeLessThan(at(0.75));
  });

  it('bakes curvature and cavity, brighter on convex and darker in concave', async () => {
    const baked = await bakeMaps({ high: uvSphere(0.5, 32, 16), low: lowPlane(), size: 64, kinds: ['curvature', 'cavity'], cage: 0.6, padding: 0 });
    expect(baked.curvature).toBeDefined();
    expect(baked.cavity).toBeDefined();
    // A sphere is convex everywhere it was hit: curvature at or above flat, cavity never darkened.
    const hitTexel = 32 * 64 + 32;
    expect(baked.curvature![hitTexel]!).toBeGreaterThanOrEqual(128);
    expect(baked.cavity![hitTexel]!).toBe(255);
  });

  it('dilates the gutter past the charts and reports coverage', async () => {
    const low = lowPlane();
    // Shrink the uvs to the middle half so there is background to dilate into.
    for (let i = 0; i < low.uvs.length; i += 1) low.uvs[i] = 0.25 + low.uvs[i]! * 0.5;
    const bare = await bakeMaps({ high: bumpedPlane(), low, size: 64, kinds: ['normal'], cage: 0.2, padding: 0 });
    const padded = await bakeMaps({ high: bumpedPlane(), low, size: 64, kinds: ['normal'], cage: 0.2, padding: 3 });
    expect(bare.coverage).toBeCloseTo(0.25, 1);
    // The pixel just outside the chart is flat blue unpadded and takes its neighbour's colour padded.
    const outside = 32 * 64 + 15;
    expect(bare.normal![outside * 3 + 2]).toBe(255);
    expect(padded.normal![outside * 3]).not.toBe(128);
  });

  it('builds tangents that follow the uv layout', () => {
    const low = lowPlane();
    const mesh = new EditableMesh({ positions: low.positions, indices: low.indices });
    const t = vertexTangents(mesh.positions, mesh.normals, mesh.indices, low.uvs);
    expect([t[0], t[1], t[2], t[3]]).toEqual([1, 0, 0, 1].map((x) => expect.closeTo(x, 5)));
  });
});
