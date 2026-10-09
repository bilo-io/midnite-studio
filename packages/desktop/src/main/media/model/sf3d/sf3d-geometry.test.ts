import { inflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { atlasLayout, bakeTexture, buildAtlas, clampedBarycentric } from './atlas';
import { vertexNormals, writeTexturedGlb } from './glb-textured';
import { cubeTetGrid, deformGrid, marchingTets } from './marching-tets';
import { crc32, encodePng } from './png';
import { alphaBounds, prepareSf3dInput, sf3dIntrinsicNormed } from './prepare-image';
import { createColorSampler, parseColorMlp, sampleTriplane, SF3D_RADIUS } from './triplane';

/** A sphere of radius `r` around (0.5, 0.5, 0.5) in grid space, positive inside. */
const sphereField = (vertices: Float32Array, r: number) => {
  const field = new Float32Array(vertices.length / 3);
  for (let i = 0; i < field.length; i += 1) {
    const dx = vertices[i * 3]! - 0.5, dy = vertices[i * 3 + 1]! - 0.5, dz = vertices[i * 3 + 2]! - 0.5;
    field[i] = r - Math.hypot(dx, dy, dz);
  }
  return field;
};

describe('marching tetrahedra', () => {
  const grid = cubeTetGrid(10);
  // 0.31, not 0.3: no grid vertex sits exactly on the surface, which would weld zero-area slivers.
  const mesh = marchingTets(grid, sphereField(grid.vertices, 0.31));

  it('cuts a closed, consistently wound surface out of a sphere field', () => {
    const tris = mesh.indices.length / 3;
    expect(tris).toBeGreaterThan(100);
    // Every directed edge appears once and its reverse once: watertight and consistently oriented.
    const directed = new Map<string, number>();
    for (let t = 0; t < mesh.indices.length; t += 3) {
      for (let k = 0; k < 3; k += 1) {
        const key = `${mesh.indices[t + k]}>${mesh.indices[t + ((k + 1) % 3)]}`;
        directed.set(key, (directed.get(key) ?? 0) + 1);
      }
    }
    for (const [key, n] of directed) {
      expect(n).toBe(1);
      const [a, b] = key.split('>');
      expect(directed.get(`${b}>${a}`)).toBe(1);
    }
  });

  it('puts vertices on the sphere and points every normal outward', () => {
    const p = mesh.positions;
    for (let i = 0; i < p.length; i += 3) {
      expect(Math.abs(Math.hypot(p[i]! - 0.5, p[i + 1]! - 0.5, p[i + 2]! - 0.5) - 0.31)).toBeLessThan(0.02);
    }
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const [a, b, c] = [mesh.indices[t]! * 3, mesh.indices[t + 1]! * 3, mesh.indices[t + 2]! * 3];
      const u = [p[b]! - p[a]!, p[b + 1]! - p[a + 1]!, p[b + 2]! - p[a + 2]!];
      const v = [p[c]! - p[a]!, p[c + 1]! - p[a + 1]!, p[c + 2]! - p[a + 2]!];
      const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
      const centroid = [(p[a]! + p[b]! + p[c]!) / 3 - 0.5, (p[a + 1]! + p[b + 1]! + p[c + 1]!) / 3 - 0.5, (p[a + 2]! + p[b + 2]! + p[c + 2]!) / 3 - 0.5];
      expect(n[0]! * centroid[0]! + n[1]! * centroid[1]! + n[2]! * centroid[2]!).toBeGreaterThan(0);
    }
  });

  it('returns nothing for an all-outside or all-inside field', () => {
    expect(marchingTets(grid, new Float32Array(grid.vertices.length / 3).fill(-1)).indices.length).toBe(0);
    expect(marchingTets(grid, new Float32Array(grid.vertices.length / 3).fill(1)).indices.length).toBe(0);
  });

  it('cuts one tet into one triangle or a two-triangle quad', () => {
    const tet = { vertices: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]), indices: Int32Array.from([0, 1, 2, 3]) };
    expect(marchingTets(tet, Float32Array.from([1, -1, -1, -1])).indices.length).toBe(3);
    expect(marchingTets(tet, Float32Array.from([1, 1, -1, -1])).indices.length).toBe(6);
    // The crossing sits where the field is zero: 1 → -3 crosses a quarter of the way along.
    const quarter = marchingTets(tet, Float32Array.from([1, -3, -3, -3]));
    expect(Math.max(...quarter.positions)).toBeCloseTo(0.25, 5);
  });

  it('deforms the grid by tanh(offset) / resolution, bounded by one cell', () => {
    const v = Float32Array.from([0.5, 0.5, 0.5]);
    expect(deformGrid(v, Float32Array.from([1e6, -1e6, 0]), 100)).toEqual(Float32Array.from([0.51, 0.49, 0.5]));
    expect(deformGrid(v, null, 100)).toBe(v);
    expect(() => deformGrid(v, Float32Array.from([1]), 100)).toThrow(/vertex_offset/);
  });

  it('rejects a field that does not match the grid, and honours cancel', () => {
    expect(() => marchingTets(grid, new Float32Array(3))).toThrow(/grid vertices/);
    expect(() => marchingTets(grid, sphereField(grid.vertices, 0.3), { isCancelled: () => true })).toThrow('cancelled');
  });
});

describe('UV atlas and bake', () => {
  it('lays out two triangles per cell and grows cells to fill the texture', () => {
    expect(atlasLayout(8, 64)).toEqual({ cols: 2, cell: 32 });
    expect(atlasLayout(1, 16)).toEqual({ cols: 1, cell: 16 });
    expect(() => atlasLayout(100_000, 256)).toThrow(/larger texture/);
  });

  it('gives every triangle its own slot: in [0,1], inside its cell, never overlapping its partner', () => {
    const atlas = buildAtlas(7, 64);
    const cellUv = atlas.cell / atlas.size;
    for (let t = 0; t < 7; t += 1) {
      const pair = t >> 1;
      const cx = (pair % atlas.cols) * cellUv;
      const cy = Math.floor(pair / atlas.cols) * cellUv;
      const sums: number[] = [];
      for (let k = 0; k < 3; k += 1) {
        const u = atlas.uvs[t * 6 + k * 2]!, v = atlas.uvs[t * 6 + k * 2 + 1]!;
        expect(u).toBeGreaterThan(cx);
        expect(u).toBeLessThan(cx + cellUv);
        expect(v).toBeGreaterThan(cy);
        expect(v).toBeLessThan(cy + cellUv);
        sums.push((u - cx) / cellUv + (v - cy) / cellUv);
      }
      // Lower halves sit below the cell's diagonal (u + v < 1), upper halves above it.
      if (t % 2 === 0) expect(Math.max(...sums)).toBeLessThan(1);
      else expect(Math.min(...sums)).toBeGreaterThan(1);
    }
  });

  it('clamps barycentrics onto the triangle', () => {
    const inside = clampedBarycentric(0.25, 0.25, 0, 0, 1, 0, 0, 1);
    expect(inside.reduce((a, b) => a + b)).toBeCloseTo(1);
    expect(inside[1]).toBeCloseTo(0.25);
    expect(inside[2]).toBeCloseTo(0.25);
    // Beyond the hypotenuse → its midpoint.
    const outside = clampedBarycentric(1, 1, 0, 0, 1, 0, 0, 1);
    expect(outside).toEqual([0, 0.5, 0.5]);
  });

  it('bakes the colour of the 3D point under each texel', () => {
    // Two triangles: one at x = 0 (should bake black), one at x = 1 (should bake red).
    const positions = Float32Array.from([0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 1]);
    const indices = Uint32Array.from([0, 1, 2, 3, 4, 5]);
    const atlas = buildAtlas(2, 32);
    const rgba = bakeTexture(atlas, positions, indices, (x, _y, _z, out) => {
      out[0] = x;
      out[1] = 0;
      out[2] = 0;
    });
    const texel = (x: number, y: number) => rgba[(y * 32 + x) * 4]!;
    expect(texel(4, 4)).toBe(0);
    expect(texel(28, 28)).toBe(255);
    expect(rgba[3]).toBe(255);
  });
});

describe('triplane and colour MLP', () => {
  // C = 1 channel, R = 2: corners hold distinct values per plane.
  const tp = { channels: 1, resolution: 2, data: Float32Array.from([1, 2, 3, 4, 10, 20, 30, 40, 100, 200, 300, 400]) };

  it('samples with align_corners (corners exact, centre the mean) over (x,y), (x,z), (y,z)', () => {
    const r = SF3D_RADIUS;
    expect([...sampleTriplane(tp, -r, -r, -r)]).toEqual([1, 10, 100]);
    expect([...sampleTriplane(tp, r, -r, r)]).toEqual([2, 40, 300]);
    expect([...sampleTriplane(tp, 0, 0, 0)]).toEqual([2.5, 25, 250]);
  });

  it('parses features_mlp_weights.json and checks the layer chain', () => {
    expect(() => parseColorMlp({ w0: [[1, 2]], b0: [0], w1: [[1, 2, 3]], b1: [0] })).toThrow(/layer 1/);
    expect(() => parseColorMlp({})).toThrow(/no layers/);
    const mlp = parseColorMlp({ w0: [[1, 0, 0], [0, 1, 0]], b0: [0, 0], w1: [[1, 0], [0, 1], [0, 0]], b1: [0, 0, 0] });
    expect(mlp.layers.map((l) => [l.inputs, l.outputs])).toEqual([[3, 2], [2, 3]]);
  });

  it('runs SiLU between layers and a sigmoid out', () => {
    const mlp = parseColorMlp({ w0: [[1, 0, 0]], b0: [0], w1: [[1], [0], [-100]], b1: [0, 0, 0] });
    const sample = createColorSampler({ channels: 1, resolution: 2, data: new Float32Array(12).fill(2) }, mlp);
    const out = new Float32Array(3);
    sample(0, 0, 0, out);
    const silu2 = 2 / (1 + Math.exp(-2));
    expect(out[0]).toBeCloseTo(1 / (1 + Math.exp(-silu2)), 5);
    expect(out[1]).toBeCloseTo(0.5, 5);
    expect(out[2]).toBeLessThan(1e-6);
    expect(() => createColorSampler({ channels: 2, resolution: 2, data: new Float32Array(24) }, mlp)).toThrow(/takes 3/);
  });
});

describe('png and glb', () => {
  it('encodes a valid RGBA PNG', () => {
    const png = encodePng(Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255]), 2, 1);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.readUInt32BE(16)).toBe(2);
    expect(png.readUInt32BE(20)).toBe(1);
    const idatLength = png.readUInt32BE(33);
    const raw = inflateSync(png.subarray(41, 41 + idatLength));
    expect([...raw]).toEqual([0, 255, 0, 0, 255, 0, 255, 0, 255]);
    expect(crc32(Buffer.from('IEND'))).toBe(0xae426082);
    expect(() => encodePng(new Uint8Array(3), 1, 1)).toThrow();
  });

  it('writes a textured glb with one non-indexed primitive and an embedded PNG', () => {
    const positions = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const indices = Uint32Array.from([0, 1, 2, 0, 2, 3]);
    const png = encodePng(new Uint8Array(4 * 4 * 4).fill(200), 4, 4);
    const glb = writeTexturedGlb({ positions, indices, uvs: buildAtlas(2, 16).uvs, png, name: 'cup', roughness: 0.6, metalness: 0 });
    expect(glb.readUInt32LE(0)).toBe(0x46546c67);
    expect(glb.readUInt32LE(8)).toBe(glb.length);
    const jsonLength = glb.readUInt32LE(12);
    const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
    expect(json.accessors[0].count).toBe(6);
    expect(json.accessors[0].max).toEqual([1, 1, 1]);
    expect(json.meshes[0].primitives[0].attributes).toEqual({ POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 });
    expect(json.images[0].mimeType).toBe('image/png');
    const binStart = 20 + jsonLength + 8;
    const view = json.bufferViews[3];
    expect([...glb.subarray(binStart + view.byteOffset, binStart + view.byteOffset + 8)]).toEqual([...png.subarray(0, 8)]);
  });

  it('computes unit, area-weighted vertex normals', () => {
    const n = vertexNormals(Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]), Uint32Array.from([0, 1, 2]));
    expect([...n.subarray(0, 3)]).toEqual([0, 0, 1]);
  });
});

describe('input picture', () => {
  it('crops a cut-out to its alpha, fills 85% of the frame and composites over grey', () => {
    // 10×10 transparent with a 2×2 opaque red block at (4,4).
    const data = new Uint8Array(10 * 10 * 4);
    for (const [x, y] of [[4, 4], [5, 4], [4, 5], [5, 5]]) data.set([255, 0, 0, 255], (y! * 10 + x!) * 4);
    const image = { data, width: 10, height: 10 };
    expect(alphaBounds(image)).toEqual({ x0: 4, y0: 4, x1: 6, y1: 6 });
    const rgb = prepareSf3dInput(image, 64);
    const at = (x: number, y: number) => [...rgb.subarray((y * 64 + x) * 3, (y * 64 + x) * 3 + 3)];
    expect(at(32, 32)).toEqual([1, 0, 0]);
    expect(at(1, 1)).toEqual([0.5, 0.5, 0.5]);
    // 85% of 64 ≈ 54 px of red across the middle row.
    const reds = Array.from({ length: 64 }, (_, x) => at(x, 32)[0]! > 0.9).filter(Boolean).length;
    expect(reds).toBeGreaterThanOrEqual(52);
    expect(reds).toBeLessThanOrEqual(56);
  });

  it('fits an opaque picture whole and rejects a malformed one', () => {
    const rgb = prepareSf3dInput({ data: new Uint8Array(4 * 2 * 4).fill(255), width: 4, height: 2 }, 8);
    expect(rgb[(1 * 8 + 4) * 3]).toBe(0.5); // letterbox above
    expect(rgb[(4 * 8 + 4) * 3]).toBe(1);
    expect(() => prepareSf3dInput({ data: new Uint8Array(3), width: 1, height: 1 })).toThrow(/could not be read/);
  });

  it('builds SF3D’s 40° normalised intrinsics', () => {
    const k = sf3dIntrinsicNormed();
    expect(k[0]).toBeCloseTo(0.5 / Math.tan((20 * Math.PI) / 180));
    expect(k[2]).toBe(0.5);
  });
});
