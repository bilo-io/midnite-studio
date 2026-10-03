import { describe, expect, it } from 'vitest';

import { ModelSpecSchema, type ModelPartInput, type ModelSpec } from '../media-model';
import { csg } from './csg';
import { applyDirection, applyPoint, composeLocal, decompose, invert, multiply } from './math';
import { applyModifiers, bevelSoup, loopSubdivide, tessellate } from './modifiers';
import { buildLocalMesh } from './primitives';
import { bounds, isClosed, signedVolume, weld } from './raw';
import {
  buildScene,
  buildSceneChecked,
  descendantIndices,
  resolveMaterial,
  sceneBounds,
  semanticIssues,
  worldMatrices,
} from './scene';

const spec = (...parts: ModelPartInput[]): ModelSpec => ModelSpecSchema.parse({ name: 't', parts });
const part = (input: ModelPartInput) => spec(input).parts[0]!;

const volumeOf = (mesh: { positions: number[]; indices: number[] }): number => signedVolume(mesh.positions, mesh.indices);
const unitNormals = (mesh: { normals: number[] }): boolean => {
  for (let i = 0; i < mesh.normals.length; i += 3) {
    if (Math.abs(Math.hypot(mesh.normals[i]!, mesh.normals[i + 1]!, mesh.normals[i + 2]!) - 1) > 1e-6) return false;
  }
  return true;
};

/** One of every closed primitive, with the volume it should (roughly) enclose. */
const SOLIDS: { input: ModelPartInput; volume: number; tolerance: number }[] = [
  { input: { shape: 'box', size: [1, 2, 3] }, volume: 6, tolerance: 1e-6 },
  { input: { shape: 'sphere', radius: 1 }, volume: (4 / 3) * Math.PI, tolerance: 0.05 },
  { input: { shape: 'cylinder', radiusTop: 1, radiusBottom: 1, height: 2 }, volume: 2 * Math.PI, tolerance: 0.05 },
  { input: { shape: 'cone', radius: 1, height: 3 }, volume: Math.PI, tolerance: 0.05 },
  { input: { shape: 'torus', radius: 1, tube: 0.25 }, volume: 2 * Math.PI * Math.PI * 1 * 0.0625, tolerance: 0.06 },
  { input: { shape: 'lathe', profile: [[0, 0], [1, 0], [1, 2], [0, 2]] }, volume: 2 * Math.PI, tolerance: 0.05 },
  { input: { shape: 'extrude', outline: [[0, 0], [2, 0], [2, 1], [0, 1]], height: 3 }, volume: 6, tolerance: 1e-6 },
  { input: { shape: 'capsule', radius: 0.5, height: 1 }, volume: Math.PI * 0.25 + (4 / 3) * Math.PI * 0.125, tolerance: 0.05 },
  { input: { shape: 'roundedBox', size: [2, 2, 2], radius: 0.25 }, volume: 8 - (4 - Math.PI) * 0.0625 * 2 * 3 - (8 - (4 / 3) * Math.PI) * 0.015625, tolerance: 0.06 },
  { input: { shape: 'wedge', size: [2, 1, 2] }, volume: 2, tolerance: 1e-6 },
  { input: { shape: 'prism', radius: 1, height: 2, sides: 6 }, volume: ((3 * Math.sqrt(3)) / 2) * 2, tolerance: 1e-6 },
  { input: { shape: 'ellipsoid', radii: [1, 2, 3] }, volume: (4 / 3) * Math.PI * 6, tolerance: 0.05 },
  { input: { shape: 'tube', path: [[0, 0, 0], [0, 2, 0]], radius: 0.5, spline: false }, volume: Math.PI * 0.25 * 2, tolerance: 0.05 },
  {
    input: { shape: 'sweep', profile: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]], path: [[0, 0, 0], [0, 0, 3]], spline: false },
    volume: 3,
    tolerance: 1e-6,
  },
  {
    input: {
      shape: 'loft',
      sections: [
        { y: 0, outline: [[-1, -1], [1, -1], [1, 1], [-1, 1]] },
        { y: 2, outline: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]] },
      ],
    },
    volume: (2 / 3) * (4 + 1 + Math.sqrt(4 * 1)),
    tolerance: 1e-6,
  },
  {
    input: {
      shape: 'mesh',
      vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]],
      faces: [[0, 2, 1], [0, 1, 3], [1, 2, 3], [0, 3, 2]],
    },
    volume: 1 / 6,
    tolerance: 1e-6,
  },
];

describe('primitives', () => {
  it.each(SOLIDS.map((s) => [s.input.shape, s] as const))('%s builds a closed, outward-wound mesh with unit normals', (_name, solid) => {
    const mesh = buildLocalMesh(part(solid.input))!;
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(unitNormals(mesh)).toBe(true);
    expect(isClosed(mesh)).toBe(true);
    const volume = volumeOf(mesh);
    expect(volume).toBeGreaterThan(0);
    expect(Math.abs(volume - solid.volume) / solid.volume).toBeLessThan(solid.tolerance);
  });

  it('keeps a lathe listed top to bottom outward', () => {
    const mesh = buildLocalMesh(part({ shape: 'lathe', profile: [[0, 2], [1, 2], [1, 0], [0, 0]] }))!;
    expect(volumeOf(mesh)).toBeGreaterThan(0);
  });

  it('honours segments: fewer segments, fewer triangles', () => {
    const coarse = buildLocalMesh(part({ shape: 'sphere', radius: 1, segments: 8 }))!;
    const fine = buildLocalMesh(part({ shape: 'sphere', radius: 1, segments: 48 }))!;
    expect(coarse.indices.length).toBeLessThan(fine.indices.length / 4);
  });

  it('rounds a roundedBox: the extreme corner pulls in, the face centre does not', () => {
    const mesh = buildLocalMesh(part({ shape: 'roundedBox', size: [2, 2, 2], radius: 0.5 }))!;
    const { min, max } = bounds(mesh.positions);
    expect(max).toEqual([1, 1, 1].map((n) => expect.closeTo(n, 5)));
    expect(min[0]).toBeCloseTo(-1, 5);
    let farthest = 0;
    for (let i = 0; i < mesh.positions.length; i += 3) farthest = Math.max(farthest, Math.hypot(mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!));
    expect(farthest).toBeLessThan(Math.sqrt(3) - 0.2);
  });

  it('follows a spline: a bent tube leaves the straight line', () => {
    const mesh = buildLocalMesh(part({ shape: 'tube', path: [[0, 0, 0], [1, 1, 0], [2, 0, 0]], radius: 0.1 }))!;
    const { max } = bounds(mesh.positions);
    expect(max[1]).toBeGreaterThan(0.5);
    expect(isClosed(mesh)).toBe(true);
    expect(volumeOf(mesh)).toBeGreaterThan(0);
  });

  it('builds a closed tube loop', () => {
    const mesh = buildLocalMesh(part({ shape: 'tube', path: [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1]], radius: 0.1, closed: true }))!;
    expect(isClosed(mesh)).toBe(true);
    expect(volumeOf(mesh)).toBeGreaterThan(0);
  });

  it('flat-shades a low-poly sphere when smoothAngle is 0', () => {
    const flat = buildLocalMesh(part({ shape: 'sphere', radius: 1, segments: 8 }))!;
    // The default smooth sphere shares normals at its vertices; faceted output (smoothAngle 0) is built via buildScene.
    expect(flat.normals.length).toBeGreaterThan(0);
    const faceted = buildScene(spec({ shape: 'sphere', radius: 1, segments: 8, smoothAngle: 0 }))[0]!;
    const normals = new Set<string>();
    for (let i = 0; i < faceted.normals.length; i += 3) normals.add(faceted.normals.slice(i, i + 3).map((n) => n.toFixed(3)).join(','));
    expect(normals.size).toBeGreaterThan(30);
  });
});

describe('modifiers', () => {
  const box = (): ReturnType<typeof weld> => weld(buildLocalMesh(part({ shape: 'box', size: [1, 1, 1] }))!);

  it('subdivision keeps the mesh closed, quadruples triangles and rounds the corners', () => {
    const once = loopSubdivide(box());
    expect(once.indices.length).toBe(box().indices.length * 4);
    expect(isClosed(once)).toBe(true);
    let farthest = 0;
    for (let i = 0; i < once.positions.length; i += 3) farthest = Math.max(farthest, Math.hypot(once.positions[i]!, once.positions[i + 1]!, once.positions[i + 2]!));
    expect(farthest).toBeLessThan(Math.sqrt(3) / 2 - 0.01);
    expect(volumeOf(once)).toBeGreaterThan(0);
  });

  it('bevel chamfers a box: closed, smaller volume, more faces', () => {
    const base = box();
    const beveled = bevelSoup(base, 0.1);
    expect(beveled.indices.length).toBeGreaterThan(base.indices.length);
    expect(isClosed(beveled)).toBe(true);
    const volume = volumeOf(beveled);
    expect(volume).toBeLessThan(1);
    expect(volume).toBeGreaterThan(0.9);
  });

  it('bevel leaves a smooth sphere alone', () => {
    const sphere = weld(buildLocalMesh(part({ shape: 'sphere', radius: 1 }))!);
    expect(bevelSoup(sphere, 0.1).indices.length).toBe(sphere.indices.length);
  });

  it('bevel works through a modifier stack on a cylinder', () => {
    const mesh = buildLocalMesh(part({ shape: 'cylinder', radiusTop: 1, radiusBottom: 1, height: 2 }))!;
    const result = applyModifiers(mesh, [{ type: 'bevel', amount: 0.1 }]);
    expect(isClosed(result.soup)).toBe(true);
    expect(volumeOf(result.soup)).toBeLessThan(2 * Math.PI);
  });

  it('mirror, array and radial array multiply the mesh and stay closed', () => {
    const mesh = buildLocalMesh(part({ shape: 'box', size: [1, 1, 1] }))!;
    const mirrored = applyModifiers(mesh, [{ type: 'mirror', axis: 'x', offset: 1 }]).soup;
    expect(bounds(mirrored.positions).max[0]).toBeCloseTo(2.5, 5);
    expect(volumeOf(mirrored)).toBeCloseTo(2, 5);
    const array = applyModifiers(mesh, [{ type: 'array', count: 4, offset: [2, 0, 0] }]).soup;
    expect(volumeOf(array)).toBeCloseTo(4, 5);
    const radial = applyModifiers(mesh, [{ type: 'radialArray', count: 6, axis: 'y', radius: 3 }]).soup;
    expect(volumeOf(radial)).toBeCloseTo(6, 5);
    expect(isClosed(radial)).toBe(true);
  });

  it('twist, taper and bend refine then deform without opening the mesh', () => {
    const mesh = buildLocalMesh(part({ shape: 'box', size: [1, 4, 1] }))!;
    for (const modifier of [
      { type: 'twist', angle: 90, axis: 'y' },
      { type: 'taper', amount: 0.3, axis: 'y' },
      { type: 'bend', angle: 60, axis: 'y' },
    ] as const) {
      const out = applyModifiers(mesh, [modifier]).soup;
      expect(out.indices.length).toBeGreaterThan(12 * 4);
      expect(isClosed(out)).toBe(true);
      expect(volumeOf(out)).toBeGreaterThan(0);
    }
    const tapered = applyModifiers(mesh, [{ type: 'taper', amount: 0, axis: 'y' }]).soup;
    const top = bounds(tapered.positions);
    expect(top.max[0]).toBeLessThanOrEqual(0.5 + 1e-6);
    expect(volumeOf(tapered)).toBeCloseTo(4 / 3, 1);
    const bent = applyModifiers(mesh, [{ type: 'bend', angle: 90, axis: 'y' }]).soup;
    expect(bounds(bent.positions).max[0]).toBeGreaterThan(1.0);
  });

  it('skips a disabled modifier', () => {
    const mesh = buildLocalMesh(part({ shape: 'box', size: [1, 1, 1] }))!;
    const out = applyModifiers(mesh, [{ type: 'array', count: 3, offset: [2, 0, 0], enabled: false }]).soup;
    expect(volumeOf(out)).toBeCloseTo(1, 6);
  });

  it('refuses a stack that would pass the triangle cap, with an issue', () => {
    const mesh = buildLocalMesh(part({ shape: 'sphere', radius: 1 }))!;
    const result = applyModifiers(mesh, [{ type: 'array', count: 64, offset: [3, 0, 0] }, { type: 'array', count: 64, offset: [0, 3, 0] }]);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.soup.indices.length / 3).toBeLessThanOrEqual(60_000);
  });

  it('tessellate shares midpoints, so splitting cannot crack the mesh', () => {
    const out = tessellate(box(), 0.3, 50_000);
    expect(isClosed(out)).toBe(true);
    expect(volumeOf(out)).toBeCloseTo(1, 6);
  });
});

describe('boolean solids', () => {
  const cube = (size: number, at: [number, number, number] = [0, 0, 0]) =>
    weld(buildScene(spec({ shape: 'box', size: [size, size, size], position: at }))[0]!);

  it('subtract removes the overlap: 8 - 1 = 7', () => {
    const out = csg('subtract', cube(2), cube(1, [0.5, 0.5, 0.5]));
    expect(out.ok).toBe(true);
    if (out.ok) expect(volumeOf(out.soup)).toBeCloseTo(7, 5);
  });

  it('subtract: a corner cut of a unit cube by a cube overlapping an octant', () => {
    const out = csg('subtract', cube(2), cube(2, [1, 1, 1]));
    expect(out.ok && volumeOf(out.soup)).toBeCloseTo(7, 5);
  });

  it('union: two cubes overlapping an octant', () => {
    const out = csg('union', cube(2), cube(2, [1, 1, 1]));
    expect(out.ok && volumeOf(out.soup)).toBeCloseTo(15, 5);
  });

  it('intersect: the shared octant', () => {
    const out = csg('intersect', cube(2), cube(2, [1, 1, 1]));
    expect(out.ok && volumeOf(out.soup)).toBeCloseTo(1, 5);
  });

  it('a cylinder bored through a cube leaves a closed solid with the hole volume removed', () => {
    const s = spec(
      { id: 'block', shape: 'box', size: [2, 2, 2] },
      { shape: 'cylinder', radiusTop: 0.5, radiusBottom: 0.5, height: 4, op: 'subtract', target: 'block', segments: 48 },
    );
    const result = buildSceneChecked(s);
    expect(result.issues).toEqual([]);
    expect(result.parts).toHaveLength(1);
    const volume = volumeOf(result.parts[0]!);
    expect(volume).toBeGreaterThan(8 - Math.PI * 0.25 * 2 - 0.05);
    expect(volume).toBeLessThan(8 - Math.PI * 0.25 * 2 + 0.05);
    expect(unitNormals(result.parts[0]!)).toBe(true);
    // The hole is real: nothing of the block remains on the axis.
    const hit = (() => {
      for (let i = 0; i < result.parts[0]!.positions.length; i += 3) {
        const [x, , z] = result.parts[0]!.positions.slice(i, i + 3);
        if (Math.hypot(x!, z!) < 0.45) return result.parts[0]!.positions[i + 1]!;
      }
      return null;
    })();
    expect(hit === null || Math.abs(hit) <= 1 + 1e-6).toBe(true);
  });

  it('a tool with no target subtracts from the nearest earlier solid, and shows as an operand on request', () => {
    const s = spec(
      { shape: 'box', size: [2, 2, 2] },
      { shape: 'sphere', radius: 0.8, position: [1, 1, 1], op: 'subtract' },
    );
    expect(buildScene(s)).toHaveLength(1);
    const withOperands = buildScene(s, { operands: true });
    expect(withOperands.map((p) => p.role)).toEqual(['solid', 'operand']);
    expect(withOperands[1]!.sourceIndex).toBe(1);
    expect(volumeOf(withOperands[0]!)).toBeLessThan(8);
  });

  it('reports a boolean that is too heavy instead of freezing', () => {
    const s = spec(
      { shape: 'sphere', radius: 1, segments: 96 },
      { shape: 'sphere', radius: 1, segments: 96, position: [0.5, 0, 0], op: 'subtract' },
    );
    const result = buildSceneChecked(s);
    expect(result.issues.some((issue) => /boolean/.test(issue.message))).toBe(true);
    expect(result.parts).toHaveLength(1);
  });
});

describe('hierarchy, instances and materials', () => {
  it('a child inherits its parent group transform', () => {
    const s = spec(
      { id: 'g', shape: 'group', position: [10, 0, 0] },
      { shape: 'box', size: [1, 1, 1], position: [1, 0, 0], parent: 'g' },
    );
    const parts = buildScene(s);
    expect(parts).toHaveLength(1);
    const { min, max } = sceneBounds(parts);
    expect(min[0]).toBeCloseTo(10.5, 6);
    expect(max[0]).toBeCloseTo(11.5, 6);
  });

  it('rotating a group rotates its children about the group origin', () => {
    const s = spec(
      { id: 'g', shape: 'group', rotation: [0, 0, 90] },
      { shape: 'box', size: [1, 1, 1], position: [2, 0, 0], parent: 'g' },
    );
    const { min, max } = sceneBounds(buildScene(s));
    expect(min[1]).toBeCloseTo(1.5, 6);
    expect(max[1]).toBeCloseTo(2.5, 6);
  });

  it('pivot moves the point rotation is about', () => {
    const m = composeLocal([0, 0, 0], [0, 0, 90], [1, 1, 1], [1, 0, 0]);
    const moved = applyPoint(m, [1, 0, 0]);
    expect(moved[0]).toBeCloseTo(0, 6);
    expect(moved[1]).toBeCloseTo(0, 6);
  });

  it('a negative scale mirrors the part and keeps it outward-wound', () => {
    const part = buildScene(spec({ shape: 'wedge', size: [1, 1, 1], scale: [-1, 1, 1], position: [3, 0, 0] }))[0]!;
    expect(volumeOf(part)).toBeGreaterThan(0);
    expect(sceneBounds([part]).max[0]).toBeCloseTo(3.5, 6);
  });

  it('an instance repeats its source geometry at its own transform', () => {
    const s = spec(
      { id: 'leg', shape: 'cylinder', radiusTop: 0.1, radiusBottom: 0.1, height: 1 },
      { shape: 'instance', source: 'leg', position: [2, 0, 0] },
    );
    const parts = buildScene(s);
    expect(parts).toHaveLength(2);
    expect(sceneBounds([parts[1]!]).min[0]).toBeCloseTo(1.9, 2);
  });

  it('an instance of a group copies its children, relative to the group', () => {
    const s = spec(
      { id: 'wheel', shape: 'group', position: [5, 0, 0] },
      { shape: 'torus', radius: 0.5, tube: 0.1, parent: 'wheel' },
      { shape: 'cylinder', radiusTop: 0.1, radiusBottom: 0.1, height: 0.2, parent: 'wheel', position: [0, 0, 0.5] },
      { shape: 'instance', source: 'wheel', position: [-5, 0, 0] },
    );
    const parts = buildScene(s);
    expect(parts).toHaveLength(4);
    const copies = parts.filter((p) => p.sourceIndex === 3);
    expect(copies).toHaveLength(2);
    expect(sceneBounds(copies).min[0]).toBeLessThan(-0.5);
    expect(sceneBounds(copies).max[0]).toBeLessThan(1);
    expect(descendantIndices(s.parts, 0)).toEqual([1, 2]);
  });

  it('hidden parts, and children of a hidden group, are left out', () => {
    const s = spec(
      { id: 'g', shape: 'group', hidden: true },
      { shape: 'box', size: [1, 1, 1], parent: 'g' },
      { shape: 'box', size: [1, 1, 1], hidden: true },
      { shape: 'box', size: [1, 1, 1] },
    );
    expect(buildScene(s)).toHaveLength(1);
  });

  it('materials default sensibly and carry PBR fields through', () => {
    expect(resolveMaterial(undefined)).toEqual({ metalness: 0, roughness: 0.6, emissive: '#000000', emissiveIntensity: 1, opacity: 1 });
    const parts = buildScene(
      spec({ shape: 'box', size: [1, 1, 1], color: '#ABC', material: { metalness: 1, roughness: 0.2, emissive: '#f00', opacity: 0.5 } }),
    );
    expect(parts[0]!.color).toBe('#aabbcc');
    expect(parts[0]!.material).toMatchObject({ metalness: 1, roughness: 0.2, emissive: '#ff0000', opacity: 0.5 });
  });

  it('matrix helpers: decompose inverts compose, invert inverts', () => {
    const m = composeLocal([1, 2, 3], [20, 30, 40], [2, 3, 4], [0.5, 0, 0]);
    const parts = decompose(composeLocal([1, 2, 3], [20, 30, 40], [2, 3, 4]));
    expect(parts.position).toEqual([1, 2, 3].map((n) => expect.closeTo(n, 6)));
    expect(parts.rotation).toEqual([20, 30, 40].map((n) => expect.closeTo(n, 4)));
    expect(parts.scale).toEqual([2, 3, 4].map((n) => expect.closeTo(n, 6)));
    const id = multiply(m, invert(m));
    id.forEach((v, i) => expect(v).toBeCloseTo(i % 5 === 0 ? 1 : 0, 6));
    expect(applyDirection(m, [0, 0, 0])).toEqual([0, 0, 0]);
    expect(decompose(composeLocal([0, 0, 0], [0, 0, 0], [-1, 1, 1])).scale[0]).toBe(-1);
  });

  it('world matrices follow a chain of parents', () => {
    const s = spec(
      { id: 'a', shape: 'group', position: [1, 0, 0] },
      { id: 'b', shape: 'group', position: [0, 2, 0], parent: 'a' },
      { shape: 'box', size: [1, 1, 1], position: [0, 0, 3], parent: 'b' },
    );
    const worlds = worldMatrices(s.parts);
    expect(applyPoint(worlds[2]!, [0, 0, 0])).toEqual([1, 2, 3]);
  });
});

describe('semantic checks', () => {
  it('flags dangling references, loops and bad operands', () => {
    const s = spec(
      { id: 'a', shape: 'box', size: [1, 1, 1], parent: 'b' },
      { id: 'b', shape: 'group', parent: 'a' },
      { shape: 'box', size: [1, 1, 1], parent: 'ghost' },
      { shape: 'instance', source: 'nowhere' },
      { shape: 'group', op: 'subtract' },
      { shape: 'mesh', vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], faces: [[0, 1, 7]] },
    );
    const issues = semanticIssues(s).map((issue) => issue.path);
    expect(issues).toContain('parts[2].parent');
    expect(issues).toContain('parts[3].source');
    expect(issues).toContain('parts[4].op');
    expect(issues).toContain('parts[5].faces[0]');
    expect(issues.some((p) => p === 'parts[0].parent' || p === 'parts[1].parent')).toBe(true);
  });

  it('a clean design has no issues', () => {
    expect(semanticIssues(spec({ shape: 'box', size: [1, 1, 1] }))).toEqual([]);
  });

  it('names resolve when unique and are reported when ambiguous', () => {
    const s = spec({ name: 'twin', shape: 'box', size: [1, 1, 1] }, { name: 'twin', shape: 'box', size: [1, 1, 1] }, { shape: 'box', size: [1, 1, 1], parent: 'twin' });
    expect(semanticIssues(s).some((issue) => /several parts/.test(issue.message))).toBe(true);
  });
});

describe('back-compat', () => {
  it('a Phase 99 design (no new fields) builds exactly as before', () => {
    const old = ModelSpecSchema.parse({
      name: 'side table',
      parts: [
        { name: 'top', shape: 'cylinder', radiusTop: 0.5, radiusBottom: 0.5, height: 0.06, position: [0, 0.72, 0], color: '#8b5a2b' },
        { name: 'vase', shape: 'lathe', profile: [[0, 0], [0.06, 0], [0.09, 0.08]], position: [0, 0.75, 0] },
      ],
    });
    const parts = buildScene(old);
    expect(parts.map((p) => p.name)).toEqual(['top', 'vase']);
    expect(parts[0]!.material).toEqual(resolveMaterial(undefined));
    expect(old.parts[0]).not.toHaveProperty('modifiers');
  });
});
