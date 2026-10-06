import { describe, expect, it } from 'vitest';

import { ModelSpecSchema, type ModelSpec } from '../../media-model';
import { applyConversion, convertToSculptMesh, revertSculptToParts } from '../convert';
import { buildScene } from '../scene';
import { bounds, isClosed, signedVolume } from '../raw';
import { decodeMeshBin, encodeMeshBin, MESH_GROUP_NONE } from './mesh-bin';
import { EditableMesh } from './editable-mesh';
import { surfaceNets } from './surface-nets';
import { pointTriangleDistSq, RemeshError, voxelRemesh } from './voxel-remesh';

const spec = (parts: unknown[]): ModelSpec => ModelSpecSchema.parse({ name: 'test', parts });

/** Every undirected edge is used by exactly two triangles, once in each direction. */
const watertight = (positions: ArrayLike<number>, indices: ArrayLike<number>): boolean =>
  isClosed({ positions: Array.from(positions), indices: Array.from(indices) });

describe('surfaceNets', () => {
  it('meshes a sphere field into a closed surface at the analytic radius', () => {
    const n = 24;
    const voxel = 0.1;
    const values = new Float32Array(n * n * n);
    const c = (n - 1) / 2;
    for (let k = 0; k < n; k += 1) for (let j = 0; j < n; j += 1) for (let i = 0; i < n; i += 1) values[i + n * (j + n * k)] = Math.hypot(i - c, j - c, k - c) * voxel - 0.8;
    const net = surfaceNets({ dims: [n, n, n], origin: [0, 0, 0], voxel, values });
    expect(watertight(net.positions, net.indices)).toBe(true);
    const centre = c * voxel;
    for (let v = 0; v < net.positions.length; v += 3) {
      const r = Math.hypot(net.positions[v]! - centre, net.positions[v + 1]! - centre, net.positions[v + 2]! - centre);
      expect(Math.abs(r - 0.8)).toBeLessThan(0.03);
    }
    // Outward winding: positive volume.
    expect(signedVolume(Array.from(net.positions), Array.from(net.indices))).toBeGreaterThan(0);
  });
});

describe('pointTriangleDistSq', () => {
  it('measures to the face, an edge and a corner', () => {
    const tri = [0, 0, 0, 1, 0, 0, 0, 1, 0] as const;
    expect(pointTriangleDistSq(0.2, 0.2, 2, ...tri)).toBeCloseTo(4);
    expect(pointTriangleDistSq(0.5, -1, 0, ...tri)).toBeCloseTo(1);
    expect(pointTriangleDistSq(-1, -1, 0, ...tri)).toBeCloseTo(2);
  });
});

describe('convertToSculptMesh', () => {
  const capsule = spec([{ shape: 'capsule', name: 'pill', radius: 0.5, height: 1, color: '#336699' }]);

  it('turns a capsule into a watertight mesh with its volume and bounds', () => {
    const sourceParts = buildScene(capsule);
    const volume = signedVolume(sourceParts[0]!.positions, sourceParts[0]!.indices);
    const out = convertToSculptMesh(capsule, { targetVertices: 8000 });
    if (!out.ok) throw new Error(out.error);
    expect(watertight(out.positions, out.indices)).toBe(true);
    const got = signedVolume(Array.from(out.positions), Array.from(out.indices));
    expect(Math.abs(got - volume) / volume).toBeLessThan(0.05);
    const a = bounds(sourceParts[0]!.positions);
    const b = bounds(Array.from(out.positions));
    for (let k = 0; k < 3; k += 1) {
      expect(Math.abs(b.min[k]! - a.min[k]!)).toBeLessThan(out.voxelSize * 1.5);
      expect(Math.abs(b.max[k]! - a.max[k]!)).toBeLessThan(out.voxelSize * 1.5);
    }
  });

  it('merges overlapping primitives into one solid, with one vertex group per part', () => {
    const robot = spec([
      { shape: 'box', name: 'torso', size: [1, 1.2, 0.6], position: [0, 1, 0], color: '#cc0000' },
      { shape: 'sphere', name: 'head', radius: 0.35, position: [0, 1.85, 0], color: '#00cc00' },
      { shape: 'cylinder', name: 'arm', radiusTop: 0.12, radiusBottom: 0.12, height: 1, position: [0.7, 1, 0], color: '#0000cc' },
      { shape: 'cylinder', name: 'leg', radiusTop: 0.15, radiusBottom: 0.15, height: 0.9, position: [0.25, 0.1, 0], color: '#cccc00' },
    ]);
    const out = convertToSculptMesh(robot, { targetVertices: 12000 });
    if (!out.ok) throw new Error(out.error);
    expect(watertight(out.positions, out.indices)).toBe(true);
    expect(out.groupTable.map((g) => g.name)).toEqual(['torso', 'head', 'arm', 'leg']);
    expect(out.groupTable.map((g) => g.color)).toEqual(['#cc0000', '#00cc00', '#0000cc', '#cccc00']);
    const seen = new Set(Array.from(out.groups));
    expect(seen.has(MESH_GROUP_NONE)).toBe(false);
    expect(seen.size).toBe(4);
    // The head sits above the torso: its vertices are the group nearest y=1.85.
    let headY = 0;
    let headCount = 0;
    for (let v = 0; v < out.groups.length; v += 1) if (out.groups[v] === 1) { headY += out.positions[v * 3 + 1]!; headCount += 1; }
    expect(headY / headCount).toBeGreaterThan(1.7);
  });

  it('survives a .mesh.bin round trip with its groups and loads as an EditableMesh', () => {
    const out = convertToSculptMesh(capsule, { targetVertices: 2000 });
    if (!out.ok) throw new Error(out.error);
    const mesh = new EditableMesh({ positions: out.positions, indices: out.indices });
    const bytes = encodeMeshBin({ positions: mesh.positions, normals: mesh.normals, indices: mesh.indices, multiresLevel: 0, groups: out.groups });
    const back = decodeMeshBin(bytes);
    expect(Array.from(back.groups!)).toEqual(Array.from(out.groups));
    expect(encodeMeshBin(back)).toEqual(bytes);
  });

  it('keeps the primitives hidden but recoverable', () => {
    const out = convertToSculptMesh(capsule, { targetVertices: 2000 });
    if (!out.ok) throw new Error(out.error);
    const { spec: converted, partId } = applyConversion(out, { src: 'pill.mesh.bin', hash: 'abcdef012345', vertices: 10, triangles: 20 });
    expect(ModelSpecSchema.safeParse(converted).success).toBe(true);
    expect(converted.parts[0]!.hidden).toBe(true);
    const sculpt = converted.parts.at(-1)!;
    expect(sculpt).toMatchObject({ shape: 'sculpt', id: partId, color: '#336699', sources: [converted.parts[0]!.id] });
    const reverted = revertSculptToParts(converted, partId)!;
    expect(reverted.parts).toHaveLength(1);
    expect(reverted.parts[0]!.hidden).toBeUndefined();
    expect(revertSculptToParts(reverted, 'nope')).toBeNull();
  });

  it('converts a selection and leaves the rest drawn', () => {
    const two = spec([
      { shape: 'sphere', name: 'a', radius: 0.4, position: [-1, 0, 0] },
      { shape: 'sphere', name: 'b', radius: 0.4, position: [1, 0, 0] },
    ]);
    const out = convertToSculptMesh(two, { parts: ['a'], targetVertices: 3000 });
    if (!out.ok) throw new Error(out.error);
    expect(out.groupTable.map((g) => g.name)).toEqual(['a']);
    const { spec: converted } = applyConversion(out, { src: 'two.mesh.bin', hash: 'abcdef012345', vertices: 1, triangles: 1 });
    expect(converted.parts.map((p) => p.hidden === true)).toEqual([true, false, false]);
  });

  it('refuses an unknown part and an empty selection with a readable error', () => {
    const missing = convertToSculptMesh(capsule, { parts: ['ghost'] });
    expect(missing).toMatchObject({ ok: false });
    const hidden = convertToSculptMesh(spec([{ shape: 'sphere', radius: 1, hidden: true }]));
    expect(hidden).toMatchObject({ ok: false });
  });

  it('is a union, not a parity: a sphere sunk into a box leaves no hole in the overlap', () => {
    const overlap = spec([
      { shape: 'box', size: [1, 1, 1] },
      { shape: 'sphere', radius: 0.4, position: [0, 0, 0] },
    ]);
    const out = convertToSculptMesh(overlap, { targetVertices: 4000 });
    if (!out.ok) throw new Error(out.error);
    // The sphere is wholly inside the box, so the result is just the box: ~1 m³, no inner shell.
    expect(signedVolume(Array.from(out.positions), Array.from(out.indices))).toBeGreaterThan(0.9);
    expect(signedVolume(Array.from(out.positions), Array.from(out.indices))).toBeLessThan(1.1);
  });
});

describe('voxelRemesh', () => {
  it('coarsens a request that would exceed the grid cap and says so', () => {
    const cube = { positions: [0, 0, 0, 100, 0, 0, 100, 100, 0, 0, 100, 0, 0, 0, 100, 100, 0, 100, 100, 100, 100, 0, 100, 100], indices: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 3, 0, 4, 3, 4, 7] };
    const out = voxelRemesh(cube, { voxelSize: 1, maxCells: 30_000 });
    expect(out.coarsened).toBe(true);
    expect(out.dims[0] * out.dims[1] * out.dims[2]).toBeLessThanOrEqual(30_000);
  });

  it('refuses nothing and no surface', () => {
    expect(() => voxelRemesh({ positions: [], indices: [] })).toThrow(RemeshError);
    expect(() => voxelRemesh({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] }, { voxelSize: 0.1 })).toThrow(RemeshError);
  });
});
