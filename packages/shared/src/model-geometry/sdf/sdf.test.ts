import { describe, expect, it, vi } from 'vitest';

import { ModelSpecSchema, type ModelSpec } from '../../media-model';
import { applySdfOps, DEFAULT_SDF_TREE, SdfTreeSchema, type SdfNode, type SdfTree } from '../../media-model-sdf';
import { decodeMeshBin } from '../mesh/mesh-bin';
import { parseOpsLog, serializeOp } from '../mesh/ops-log';
import { isClosed, signedVolume } from '../raw';
import { bakeSdf, SdfBakeError } from './bake';
import { compileSdf, evaluateSdf, sdBox, sdCapsule, sdCone, sdCylinder, sdEllipsoid, sdSphere, sdTorus, smin } from './evaluate';
import { applySdfBake, encodeSdfBake, findSdfPart, sdfMeshSrcFor, sdfOpEntry, sdfTargetId, withPartIds } from './sdf-part';

// Bakes at 128³+ take a few hundred ms alone; leave headroom for a loaded gate.
vi.setConfig({ testTimeout: 30_000 });

const tree = (nodes: unknown[], blend?: number): SdfTree => SdfTreeSchema.parse({ nodes, ...(blend !== undefined ? { blend } : {}) });
const watertight = (positions: ArrayLike<number>, indices: ArrayLike<number>): boolean => isClosed({ positions: Array.from(positions), indices: Array.from(indices) });

describe('SDF primitives', () => {
  it('give known distances', () => {
    expect(sdSphere(2, 0, 0, 1)).toBeCloseTo(1);
    expect(sdSphere(0, 0, 0, 1)).toBeCloseTo(-1);
    expect(sdBox(2, 0, 0, 1, 1, 1, 0)).toBeCloseTo(1);
    expect(sdBox(2, 2, 0, 1, 1, 1, 0)).toBeCloseTo(Math.SQRT2);
    expect(sdBox(0, 0, 0, 1, 2, 3, 0)).toBeCloseTo(-1);
    // A rounded box's corner sits `radius` inside the sharp corner's diagonal.
    expect(sdBox(1, 1, 1, 1, 1, 1, 0.2)).toBeCloseTo(Math.sqrt(3) * 0.2 - 0.2);
    expect(sdCapsule(0, 2, 0, 0.5, 2)).toBeCloseTo(0.5);
    expect(sdCapsule(1, 0, 0, 0.5, 2)).toBeCloseTo(0.5);
    expect(sdCylinder(0, 2, 0, 1, 2)).toBeCloseTo(1);
    expect(sdCylinder(3, 0, 0, 1, 2)).toBeCloseTo(2);
    expect(sdCylinder(0, 0, 0, 1, 2)).toBeCloseTo(-1);
    expect(sdTorus(1, 0, 0, 1, 0.25)).toBeCloseTo(-0.25);
    expect(sdTorus(0, 0, 0, 1, 0.25)).toBeCloseTo(0.75);
    expect(sdTorus(0, 0, 2, 1, 0.25)).toBeCloseTo(0.75);
    // Cone: base radius 1 at y = -1, apex at y = +1.
    expect(sdCone(0, 2, 0, 1, 2)).toBeCloseTo(1);
    expect(sdCone(0, -2, 0, 1, 2)).toBeCloseTo(1);
    expect(sdCone(0, 0, 0, 1, 2)).toBeLessThan(0);
    // Ellipsoid: exact on its axes, a bound elsewhere.
    expect(sdEllipsoid(3, 0, 0, 2, 1, 1)).toBeCloseTo(1, 1);
    expect(sdEllipsoid(0, 0, 0, 2, 1, 1)).toBeLessThan(0);
  });

  it('applies a node transform: position, rotation and uniform scale', () => {
    const t = tree([{ kind: 'box', name: 'b', size: [2, 0.5, 0.5], position: [1, 0, 0], rotation: [0, 0, 90], scale: 2 }]);
    // Rotated 90° about Z, the long side runs along Y and spans ±2 after scaling.
    expect(evaluateSdf(t, 1, 1.9, 0)).toBeLessThan(0);
    expect(evaluateSdf(t, 1, 2.5, 0)).toBeCloseTo(0.5);
    expect(evaluateSdf(t, 3, 0, 0)).toBeCloseTo(1.5);
  });
});

describe('operators', () => {
  it('smooth union is continuous across the seam, and never above the sharp one', () => {
    const k = 0.4;
    const f = compileSdf(
      tree([{ kind: 'union', name: 'u', k, children: [{ kind: 'sphere', name: 'a', radius: 0.5, position: [-0.4, 0, 0] }, { kind: 'sphere', name: 'b', radius: 0.5, position: [0.4, 0, 0] }] }]),
    ).distance;
    let worst = 0;
    let previous = f(-1, 0.3, 0);
    for (let x = -1; x <= 1; x += 0.001) {
      const d = f(x, 0.3, 0);
      worst = Math.max(worst, Math.abs(d - previous));
      previous = d;
      const sharp = Math.min(sdSphere(x + 0.4, 0.3, 0, 0.5), sdSphere(x - 0.4, 0.3, 0, 0.5));
      expect(d).toBeLessThanOrEqual(sharp + 1e-9);
      expect(d).toBeGreaterThanOrEqual(sharp - k / 4 - 1e-9);
    }
    // A step of 1 mm never moves the field more than ~1 mm: no jump at the seam.
    expect(worst).toBeLessThan(0.0015);
    expect(smin(1, 1, 0.4)).toBeCloseTo(0.9);
  });

  it('subtracts every later child from the first, and intersects', () => {
    const sub = tree([{ kind: 'subtract', name: 's', children: [{ kind: 'sphere', name: 'a', radius: 1 }, { kind: 'sphere', name: 'b', radius: 0.5, position: [1, 0, 0] }] }]);
    expect(evaluateSdf(sub, 0.9, 0, 0)).toBeGreaterThan(0);
    expect(evaluateSdf(sub, -0.9, 0, 0)).toBeLessThan(0);
    const both = tree([{ kind: 'intersect', name: 'i', children: [{ kind: 'sphere', name: 'a', radius: 1 }, { kind: 'box', name: 'b', size: [1, 1, 1], position: [0.5, 0, 0] }] }]);
    expect(evaluateSdf(both, -0.5, 0, 0)).toBeGreaterThan(0);
    expect(evaluateSdf(both, 0.5, 0, 0)).toBeLessThan(0);
  });

  it('mirrors, rounds and shells', () => {
    const mirrored = tree([{ kind: 'mirror', name: 'm', axis: 'x', children: [{ kind: 'sphere', name: 'eye', radius: 0.1, position: [0.3, 0, 0] }] }]);
    expect(evaluateSdf(mirrored, -0.3, 0, 0)).toBeCloseTo(-0.1);
    const rounded = tree([{ kind: 'round', name: 'r', radius: 0.1, children: [{ kind: 'box', name: 'b', size: [1, 1, 1] }] }]);
    expect(evaluateSdf(rounded, 0.6, 0, 0)).toBeCloseTo(0);
    const shell = tree([{ kind: 'shell', name: 'sh', thickness: 0.1, children: [{ kind: 'sphere', name: 's', radius: 1 }] }]);
    expect(evaluateSdf(shell, 0, 0, 0)).toBeCloseTo(0.95);
    expect(evaluateSdf(shell, 1, 0, 0)).toBeCloseTo(-0.05);
  });
});

describe('bakeSdf', () => {
  it('meshes a sphere into a closed mesh at the analytic radius', () => {
    const bake = bakeSdf(tree([{ kind: 'sphere', name: 's', radius: 0.5 }]), { resolution: 64 });
    expect(watertight(bake.positions, bake.indices)).toBe(true);
    for (let v = 0; v < bake.positions.length; v += 3) {
      const r = Math.hypot(bake.positions[v]!, bake.positions[v + 1]!, bake.positions[v + 2]!);
      expect(Math.abs(r - 0.5)).toBeLessThan(bake.voxelSize * 0.5);
    }
    const volume = signedVolume(Array.from(bake.positions), Array.from(bake.indices));
    expect(volume).toBeCloseTo((4 / 3) * Math.PI * 0.125, 2);
  });

  it('prunes blocks far from the surface and still matches the dense bake exactly', () => {
    const t = tree(
      [
        { kind: 'sphere', name: 'head', radius: 0.4, position: [0, 0.6, 0] },
        { kind: 'capsule', name: 'body', radius: 0.35, height: 0.6 },
        { kind: 'ellipsoid', name: 'belly', radii: [0.5, 0.2, 0.3], position: [0, 0.1, 0.2], rotation: [20, 0, 10] },
        { kind: 'subtract', name: 'socket', children: [{ kind: 'box', name: 'base', size: [1, 0.2, 1], position: [0, -0.7, 0] }, { kind: 'cylinder', name: 'hole', radius: 0.2, height: 0.5, position: [0, -0.7, 0] }] },
      ],
      0.15,
    );
    const sparse = bakeSdf(t, { resolution: 64 });
    const dense = bakeSdf(t, { resolution: 64, dense: true });
    expect(Array.from(sparse.positions)).toEqual(Array.from(dense.positions));
    expect(Array.from(sparse.indices)).toEqual(Array.from(dense.indices));
    expect(sparse.skipped).toBeGreaterThan(0);
    expect(sparse.evaluated).toBeLessThan(dense.evaluated);
    expect(watertight(sparse.positions, sparse.indices)).toBe(true);
  });

  it('keeps a 256³ field to a fraction of its nodes', () => {
    const bake = bakeSdf(tree([{ kind: 'sphere', name: 's', radius: 1 }]), { resolution: 256 });
    const nodes = bake.dims[0] * bake.dims[1] * bake.dims[2];
    expect(nodes).toBeGreaterThan(256 ** 3 * 0.95);
    expect(bake.evaluated).toBeLessThan(nodes * 0.3);
    expect(watertight(bake.positions, bake.indices)).toBe(true);
  });

  it('closes the surface under every modifier', () => {
    const wrap = (node: object): SdfTree => tree([{ ...node, children: [{ kind: 'box', name: 'b', size: [0.6, 1.2, 0.4], radius: 0.05 }] }]);
    for (const node of [
      { kind: 'displace', name: 'd', amplitude: 0.03, frequency: 6, octaves: 2 },
      { kind: 'twist', name: 't', angle: 90 },
      { kind: 'bend', name: 'bd', angle: 45 },
      { kind: 'round', name: 'r', radius: 0.05 },
      { kind: 'shell', name: 'sh', thickness: 0.08 },
    ]) {
      const bake = bakeSdf(wrap(node), { resolution: 48 });
      expect(watertight(bake.positions, bake.indices), node.kind).toBe(true);
    }
    const torus = bakeSdf(tree([{ kind: 'torus', name: 't', radius: 0.5, tube: 0.15 }, { kind: 'cone', name: 'c', radius: 0.2, height: 0.5, position: [0, 0.4, 0] }]), { resolution: 48 });
    expect(watertight(torus.positions, torus.indices)).toBe(true);
  });

  it('gives each vertex the group of the nearest primitive, with its colour', () => {
    const bake = bakeSdf(
      tree([
        { kind: 'sphere', name: 'left', radius: 0.3, position: [-0.5, 0, 0], color: '#ff0000' },
        { kind: 'union', name: 'right side', color: '#0000ff', children: [{ kind: 'sphere', name: 'right', radius: 0.3, position: [0.5, 0, 0] }] },
      ]),
      { resolution: 48 },
    );
    expect(bake.groupTable).toEqual([
      { name: 'left', color: '#ff0000' },
      { name: 'right', color: '#0000ff' },
    ]);
    for (let v = 0; v < bake.groups.length; v += 1) expect(bake.groups[v]).toBe(bake.positions[v * 3]! < 0 ? 0 : 1);
  });

  it('refuses a tree with no surface', () => {
    const empty = tree([{ kind: 'intersect', name: 'i', children: [{ kind: 'sphere', name: 'a', radius: 0.2, position: [-2, 0, 0] }, { kind: 'sphere', name: 'b', radius: 0.2, position: [2, 0, 0] }] }]);
    expect(() => bakeSdf(empty, { resolution: 32 })).toThrow(SdfBakeError);
  });
});

describe('SdfTreeSchema and applySdfOps', () => {
  it('requires unique names and exactly one child per modifier', () => {
    expect(SdfTreeSchema.safeParse({ nodes: [{ kind: 'sphere', name: 'a', radius: 1 }, { kind: 'sphere', name: 'a', radius: 1 }] }).success).toBe(false);
    expect(SdfTreeSchema.safeParse({ nodes: [{ kind: 'twist', name: 't', angle: 10, children: [] }] }).success).toBe(false);
    expect(SdfTreeSchema.safeParse({ nodes: [{ kind: 'union', name: 'u', children: [{ kind: 'sphere', name: 'a', radius: 1 }] }] }).success).toBe(true);
  });

  it('adds, updates, wraps, moves and removes nodes by name', () => {
    const start = tree([{ kind: 'sphere', name: 'head', radius: 0.5 }]);
    const out = applySdfOps(start, [
      { op: 'add', node: { kind: 'sphere', name: 'nose', radius: 0.1, position: [0, 0, 0.5] } as SdfNode },
      { op: 'wrap', name: 'head', node: { kind: 'union', name: 'face', k: 0.1 } },
      { op: 'move', name: 'nose', parent: 'face' },
      { op: 'update', name: 'head', set: { radius: 0.6, color: '#ffccaa' } },
      { op: 'add', node: { kind: 'sphere', name: 'tmp', radius: 0.1 } as SdfNode, parent: 'face', index: 0 },
      { op: 'remove', name: 'tmp' },
      { op: 'blend', k: 0.2 },
    ]);
    if (!out.ok) throw new Error(JSON.stringify(out.errors));
    expect(out.tree).toEqual({
      blend: 0.2,
      nodes: [
        {
          kind: 'union',
          name: 'face',
          k: 0.1,
          children: [
            { kind: 'sphere', name: 'head', radius: 0.6, color: '#ffccaa' },
            { kind: 'sphere', name: 'nose', radius: 0.1, position: [0, 0, 0.5] },
          ],
        },
      ],
    });
    // The input is untouched.
    expect(start.nodes).toHaveLength(1);
  });

  it('answers bad edits with paths and messages, not throws', () => {
    const start = DEFAULT_SDF_TREE;
    const out = applySdfOps(start, [
      { op: 'remove', name: 'ghost' },
      { op: 'add', node: { kind: 'sphere', name: 'body', radius: 1 } as SdfNode },
      { op: 'add', node: { kind: 'sphere', name: 'x', radius: 1 } as SdfNode, parent: 'body' },
    ]);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errors.map((e) => e.path)).toEqual(['ops.0', 'ops.1', 'ops.2']);
    const invalid = applySdfOps(start, [{ op: 'update', name: 'body', set: { radius: -1 } }]);
    expect(invalid.ok).toBe(false);
    const empty = applySdfOps(start, [{ op: 'remove', name: 'body' }]);
    expect(empty.ok).toBe(false);
  });
});

describe('an SDF bake as a sculpt part', () => {
  const design = (): ModelSpec => ModelSpecSchema.parse({ name: 'bust', parts: [{ name: 'plinth', shape: 'box', size: [1, 0.2, 1] }] });

  it('appends a part that keeps the tree, then re-bakes it in place', () => {
    const t = tree([{ kind: 'sphere', name: 'head', radius: 0.4, color: '#ddaa88' }, { kind: 'sphere', name: 'nose', radius: 0.08, position: [0, 0, 0.4], color: '#cc8866' }], 0.05);
    const bake = bakeSdf(t, { resolution: 32 });
    const encoded = encodeSdfBake(bake);
    const spec = withPartIds(design());
    const id = sdfTargetId(spec, null);
    const src = sdfMeshSrcFor('bust', id, encoded.hash);
    expect(src).toMatch(/^bust\.p2\.[0-9a-f]{8}\.mesh\.bin$/);
    const first = applySdfBake(spec, { tree: t, bake, file: { src, ...encoded }, index: null, id, name: 'head' });
    const parsed = ModelSpecSchema.parse(first.spec);
    const part = parsed.parts[1]!;
    expect(part).toMatchObject({ shape: 'sculpt', id: 'p2', name: 'head', sdf: { resolution: 32 }, groups: [{ name: 'head' }, { name: 'nose' }], color: '#ddaa88' });

    const decoded = decodeMeshBin(encoded.bytes);
    expect(decoded.groups).toBeDefined();
    expect(findSdfPart(parsed)).toEqual({ ok: true, index: 1 });

    const moved = { ...parsed, parts: parsed.parts.map((p, i) => (i === 1 ? { ...p, position: [1, 2, 3] as [number, number, number] } : p)) };
    const finer = bakeSdf(t, { resolution: 64 });
    const enc2 = encodeSdfBake(finer);
    const second = applySdfBake(moved, { tree: t, bake: finer, file: { src: sdfMeshSrcFor('bust', 'p2', enc2.hash), ...enc2 }, index: 1, id: 'p2' });
    expect(second.spec.parts).toHaveLength(2);
    expect(second.spec.parts[1]).toMatchObject({ position: [1, 2, 3], sdf: { resolution: 64 }, hash: enc2.hash });
    const count = (p: ModelSpec['parts'][number]): number => (p.shape === 'sculpt' ? (p.vertices ?? 0) : 0);
    expect(count(second.spec.parts[1]!)).toBeGreaterThan(count(part));
  });

  it('refuses to address a part that is not an SDF shape', () => {
    const spec = withPartIds(design());
    expect(findSdfPart(spec)).toMatchObject({ ok: false });
    expect(findSdfPart(spec, 'plinth')).toMatchObject({ ok: false, error: expect.stringContaining('box') });
  });

  it('opens the op log with the tree', () => {
    const t = DEFAULT_SDF_TREE;
    const entry = sdfOpEntry(t, { resolution: 96, voxelSize: 0.0123456 }, 'abcdef12', 'agent', '2026-10-06T00:00:00.000Z');
    const { entries } = parseOpsLog(serializeOp(entry) + '\n');
    expect(entries[0]).toMatchObject({ kind: 'sdf', by: 'agent', data: { resolution: 96, voxelSize: 0.01235, tree: t } });
  });
});
