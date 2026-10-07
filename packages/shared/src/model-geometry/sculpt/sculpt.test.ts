import { describe, expect, it } from 'vitest';

import { Bvh } from '../mesh/bvh';
import { EditableMesh } from '../mesh/editable-mesh';
import { decodeMeshBin } from '../mesh/mesh-bin';
import { applyDab, captureGrab, DAB_SCALE, falloffWeight, grabDab, SCULPT_FALLOFFS, type Dab, type SculptBrush, type SculptTarget } from './brush';
import { buildSubdivision, Multires, subdividePositions } from './multires';
import { SculptDocument, SCULPT_HISTORY_LIMIT } from './session';
import { mirrorDab, symmetryFlips } from './symmetry';

/** A flat grid in the xz plane at y = 0, `(2n+1)²` vertices on exact binary steps, normals +y. */
function grid(n = 16, step = 0.0625): { positions: Float32Array; indices: Uint32Array; side: number } {
  const side = 2 * n + 1;
  const positions = new Float32Array(side * side * 3);
  for (let j = 0; j < side; j += 1) {
    for (let i = 0; i < side; i += 1) {
      const v = j * side + i;
      positions[v * 3] = (i - n) * step;
      positions[v * 3 + 2] = (j - n) * step;
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < side - 1; j += 1) {
    for (let i = 0; i < side - 1; i += 1) {
      const a = j * side + i;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      // Counter-clockwise seen from +y.
      indices.push(a, c, b, b, c, d);
    }
  }
  return { positions, indices: Uint32Array.from(indices), side };
}

function target(arrays = grid()): SculptTarget & { side: number } {
  const mesh = new EditableMesh({ positions: arrays.positions, indices: arrays.indices });
  return { mesh, bvh: new Bvh(mesh.positions, mesh.indices), mask: new Float32Array(mesh.vertexCount), side: arrays.side };
}

const vertexAt = (t: { side: number }, i: number, j: number, n = 16): number => (j + n) * t.side + (i + n);
const y = (t: SculptTarget, v: number): number => t.mesh.positions[v * 3 + 1]!;
const dab = (over: Partial<Dab> = {}): Dab => ({ brush: 'draw', center: [0, 0, 0], radius: 0.5, strength: 1, falloff: 'smooth', ...over });

describe('falloff curves', () => {
  it('are 1 at the centre (except root/sharp/linear also 1), 0 at the rim, and never increase outward', () => {
    for (const kind of SCULPT_FALLOFFS) {
      expect(falloffWeight(kind, 0)).toBeCloseTo(1);
      expect(falloffWeight(kind, 1)).toBe(0);
      let last = Infinity;
      for (let d = 0; d < 1; d += 0.05) {
        const w = falloffWeight(kind, d);
        expect(w).toBeLessThanOrEqual(last + 1e-12);
        last = w;
      }
    }
  });
});

describe('brushes on a grid', () => {
  it('draw raises the centre by DAB_SCALE × radius × strength and leaves the rim alone', () => {
    const t = target();
    const result = applyDab(t, dab({ strength: 0.5 }));
    expect(y(t, vertexAt(t, 0, 0))).toBeCloseTo(DAB_SCALE * 0.5 * 0.5, 6);
    expect(y(t, vertexAt(t, 8, 0))).toBe(0); // exactly on the rim (0.5)
    expect(y(t, vertexAt(t, 12, 0))).toBe(0);
    expect(result.moved.length).toBeGreaterThan(0);
    expect(t.mesh.vertexCount).toBe(t.side * t.side);
  });

  it('respects the falloff: displacement falls off with distance', () => {
    const t = target();
    applyDab(t, dab());
    const ys = [0, 2, 4, 6].map((i) => y(t, vertexAt(t, i, 0)));
    for (let k = 1; k < ys.length; k += 1) expect(ys[k]!).toBeLessThan(ys[k - 1]!);
    const linear = target();
    applyDab(linear, dab({ falloff: 'linear' }));
    expect(y(linear, vertexAt(linear, 4, 0))).toBeCloseTo(DAB_SCALE * 0.5 * 0.5, 6); // halfway → weight 0.5
  });

  it('invert carves instead', () => {
    const t = target();
    applyDab(t, dab({ invert: true }));
    expect(y(t, vertexAt(t, 0, 0))).toBeLessThan(0);
  });

  it('respects the mask: a fully masked vertex never moves, a half-masked one moves half', () => {
    const t = target();
    t.mask[vertexAt(t, 0, 0)] = 1;
    t.mask[vertexAt(t, 1, 0)] = 0.5;
    const free = target();
    applyDab(t, dab());
    applyDab(free, dab());
    expect(y(t, vertexAt(t, 0, 0))).toBe(0);
    expect(y(t, vertexAt(t, 1, 0))).toBeCloseTo(y(free, vertexAt(free, 1, 0)) / 2, 6);
  });

  it('inflate pushes along vertex normals (up on a flat grid)', () => {
    const t = target();
    applyDab(t, dab({ brush: 'inflate' }));
    expect(y(t, vertexAt(t, 0, 0))).toBeGreaterThan(0);
    expect(t.mesh.positions[vertexAt(t, 0, 0) * 3]).toBe(0);
  });

  it('smooth reduces curvature variance', () => {
    const t = target();
    // Deterministic bumps.
    for (let v = 0; v < t.mesh.vertexCount; v += 1) t.mesh.positions[v * 3 + 1] = ((v * 7919) % 13) / 130;
    t.mesh.recomputeAllNormals();
    t.bvh.refit();
    const laplacianVariance = (): number => {
      const values: number[] = [];
      for (let j = -4; j <= 4; j += 1) {
        for (let i = -4; i <= 4; i += 1) {
          const v = vertexAt(t, i, j);
          const ring = t.mesh.neighbours(v);
          values.push(ring.reduce((s, u) => s + y(t, u), 0) / ring.length - y(t, v));
        }
      }
      const mean = values.reduce((s, x) => s + x, 0) / values.length;
      return values.reduce((s, x) => s + (x - mean) ** 2, 0) / values.length;
    };
    const before = laplacianVariance();
    for (let k = 0; k < 3; k += 1) applyDab(t, dab({ brush: 'smooth', radius: 0.6 }));
    expect(laplacianVariance()).toBeLessThan(before * 0.5);
  });

  it('flatten pulls a bump toward the plane through its area centre', () => {
    const t = target();
    applyDab(t, dab());
    const peak = y(t, vertexAt(t, 0, 0));
    applyDab(t, dab({ brush: 'flatten', radius: 0.4 }));
    expect(y(t, vertexAt(t, 0, 0))).toBeLessThan(peak);
  });

  it('clay adds material up to its plane and never removes on the add side', () => {
    const t = target();
    applyDab(t, dab({ brush: 'clay', tangent: [1, 0, 0], view: [0, -1, 0] }));
    for (let v = 0; v < t.mesh.vertexCount; v += 1) expect(y(t, v)).toBeGreaterThanOrEqual(0);
    expect(y(t, vertexAt(t, 0, 0))).toBeGreaterThan(0);
  });

  it('pinch pulls vertices toward the centre within the surface', () => {
    const t = target();
    const v = vertexAt(t, 4, 0);
    applyDab(t, dab({ brush: 'pinch' }));
    expect(t.mesh.positions[v * 3]!).toBeLessThan(0.25);
    expect(y(t, v)).toBeCloseTo(0, 9);
  });

  it('crease carves along the normal and pinches', () => {
    const t = target();
    const v = vertexAt(t, 4, 0);
    applyDab(t, dab({ brush: 'crease' }));
    expect(y(t, vertexAt(t, 0, 0))).toBeLessThan(0);
    expect(t.mesh.positions[v * 3]!).toBeLessThan(0.25);
  });

  it('grab moves its captured footprint by the drag, weighted by falloff', () => {
    const t = target();
    const capture = captureGrab(t, { center: [0, 0, 0], radius: 0.5, strength: 1, falloff: 'smooth' });
    grabDab(t, capture, [0, 0.2, 0]);
    expect(y(t, vertexAt(t, 0, 0))).toBeCloseTo(0.2, 6);
    expect(y(t, vertexAt(t, 4, 0))).toBeCloseTo(0.2 * falloffWeight('smooth', 0.5), 6);
    expect(y(t, vertexAt(t, 10, 0))).toBe(0);
  });

  it('the mask brush paints the mask and moves nothing', () => {
    const t = target();
    const result = applyDab(t, dab({ brush: 'mask' }));
    expect(result.moved).toEqual([]);
    expect(t.mask[vertexAt(t, 0, 0)]).toBe(1);
    expect(t.mask[vertexAt(t, 12, 0)]).toBe(0);
    applyDab(t, dab({ brush: 'mask', invert: true }));
    expect(t.mask[vertexAt(t, 0, 0)]).toBe(0);
  });

  it('front-faces-only skips vertices facing away from the viewer', () => {
    const t = target();
    applyDab(t, dab({ frontFacesOnly: true, view: [0, 1, 0] })); // looking up at the back of the grid
    expect(y(t, vertexAt(t, 0, 0))).toBe(0);
    applyDab(t, dab({ frontFacesOnly: true, view: [0, -1, 0] }));
    expect(y(t, vertexAt(t, 0, 0))).toBeGreaterThan(0);
  });
});

describe('symmetry', () => {
  it('lists the flips of the enabled axes', () => {
    expect(symmetryFlips({ x: false, y: false, z: false, space: 'local' })).toEqual([0]);
    expect(symmetryFlips({ x: true, y: false, z: true, space: 'local' })).toEqual([0, 1, 4, 5]);
  });

  it('mirrors exactly: an X-symmetric stroke leaves a mirror-image surface', () => {
    const doc = new SculptDocument(grid());
    doc.beginStroke(brush({ brush: 'draw', radius: 0.3 }), { symmetry: { x: true, y: false, z: false, space: 'local' } });
    doc.strokeAt([0.25, 0, 0.125], [0, -1, 0]);
    doc.strokeAt([0.375, 0, -0.25], [0, -1, 0]);
    doc.endStroke();
    const p = doc.mesh.positions;
    const side = 33;
    let moved = 0;
    for (let j = 0; j < side; j += 1) {
      for (let i = 0; i < side; i += 1) {
        const v = j * side + i;
        const m = j * side + (side - 1 - i);
        expect(p[v * 3 + 1]).toBe(p[m * 3 + 1]);
        expect(p[v * 3]! + p[m * 3]!).toBe(0);
        if (p[v * 3 + 1] !== 0) moved += 1;
      }
    }
    expect(moved).toBeGreaterThan(0);
  });

  it('a dab on the mirror plane is applied once, not twice', () => {
    expect(mirrorDab({ center: [0, 0.2, 0] }, { x: true, y: false, z: false, space: 'local' })).toHaveLength(1);
  });

  it('world-space symmetry mirrors through the part transform', () => {
    // A part moved +1 on x: world X symmetry mirrors about local x = -1.
    const toWorld = [1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const copies = mirrorDab({ center: [0.5, 0, 0] }, { x: true, y: false, z: false, space: 'world' }, toWorld);
    expect(copies[1]!.center[0]).toBeCloseTo(-2.5);
  });
});

const brush = (over: Partial<SculptBrush> = {}): SculptBrush => ({ brush: 'draw', radius: 0.5, strength: 1, falloff: 'smooth', spacing: 0.1, ...over });

describe('SculptDocument', () => {
  it('spaces dabs along a stroke by spacing × radius', () => {
    const doc = new SculptDocument(grid());
    doc.beginStroke(brush({ radius: 0.2, spacing: 0.25 }));
    doc.strokeAt([-0.5, 0, 0], [0, -1, 0]);
    doc.strokeAt([0.5, 0, 0], [0, -1, 0]);
    const summary = doc.endStroke()!;
    expect(summary.dabs).toBe(1 + Math.floor(1 / 0.05));
  });

  it('raycasts a stroke onto the surface and ends with one undoable revision', () => {
    const doc = new SculptDocument(grid());
    const original = doc.mesh.positions.slice();
    doc.beginStroke(brush());
    expect(doc.strokeTo({ origin: [0, 1, 0], dir: [0, -1, 0] })).not.toBeNull();
    expect(doc.strokeTo({ origin: [5, 1, 0], dir: [0, -1, 0] })).toBeNull(); // off the grid
    const summary = doc.endStroke()!;
    expect(summary.moved).toBeGreaterThan(0);
    expect(summary.maxDisplacement).toBeCloseTo(DAB_SCALE * 0.5, 6);
    expect(doc.revision).toBe(1);
    const after = doc.mesh.positions.slice();
    expect(doc.seek(0)).toBe(true);
    expect(doc.mesh.positions).toEqual(original);
    expect(doc.seek(1)).toBe(true);
    expect(doc.mesh.positions).toEqual(after);
    expect(doc.seek(5)).toBe(false);
  });

  it('a stroke that touches nothing records nothing', () => {
    const doc = new SculptDocument(grid());
    doc.beginStroke(brush());
    doc.strokeTo({ origin: [5, 1, 5], dir: [0, -1, 0] });
    expect(doc.endStroke()).toBeNull();
    expect(doc.revision).toBe(0);
  });

  it('pressure scales strength', () => {
    const doc = new SculptDocument(grid());
    doc.beginStroke(brush());
    doc.strokeTo({ origin: [0, 1, 0], dir: [0, -1, 0], pressure: 0.25 });
    expect(doc.endStroke()!.maxDisplacement).toBeCloseTo(DAB_SCALE * 0.5 * 0.25, 6);
  });

  it('grab drags along the view plane, even off the surface', () => {
    const doc = new SculptDocument(grid());
    doc.beginStroke(brush({ brush: 'grab' }));
    doc.strokeTo({ origin: [0, 1, 1], dir: [0, -1, -1] }); // hits (0,0,0)
    doc.strokeTo({ origin: [0, 1.2, 1], dir: [0, -1, -1] }); // plane point moves
    const summary = doc.endStroke()!;
    expect(summary.moved).toBeGreaterThan(0);
    expect(doc.mesh.positions[(16 * 33 + 16) * 3 + 1]!).toBeGreaterThan(0);
  });

  it('mask invert and clear are revisions, and masked vertices are protected', () => {
    const doc = new SculptDocument(grid());
    expect(doc.maskOp('clear')).toBe(false);
    expect(doc.maskOp('invert')).toBe(true);
    expect(doc.revision).toBe(1);
    expect(doc.takeDelta().mask?.values.every((m) => m === 1)).toBe(true);
    doc.beginStroke(brush());
    doc.strokeAt([0, 0, 0], [0, -1, 0]);
    expect(doc.endStroke()).toBeNull();
    expect(doc.seek(0)).toBe(true);
    expect(doc.mask.every((m) => m === 0)).toBe(true);
  });

  it('keeps at most SCULPT_HISTORY_LIMIT records but keeps counting revisions', () => {
    const doc = new SculptDocument(grid(4));
    for (let k = 0; k < SCULPT_HISTORY_LIMIT + 5; k += 1) doc.maskOp('invert');
    expect(doc.revision).toBe(SCULPT_HISTORY_LIMIT + 5);
    expect(doc.reachable.min).toBe(5);
    expect(doc.seek(4)).toBe(false);
    expect(doc.seek(5)).toBe(true);
  });

  it('starts counting from the part revision it was opened at', () => {
    const doc = new SculptDocument(grid(4), 7);
    doc.maskOp('invert');
    expect(doc.revision).toBe(8);
    expect(doc.seek(7)).toBe(true);
  });

  it('serializes the current level, multires level included', () => {
    const doc = new SculptDocument(octahedron());
    doc.subdivide();
    const decoded = decodeMeshBin(doc.serialize());
    expect(decoded.multiresLevel).toBe(1);
    expect(decoded.positions.length / 3).toBe(18);
  });

  it('voxel remesh changes the topology as one undoable step', () => {
    const doc = new SculptDocument(octahedron());
    doc.remesh({ voxelSize: 0.1 });
    expect(doc.mesh.vertexCount).toBeGreaterThan(6);
    expect(doc.mesh.isClosed()).toBe(true);
    const epoch = doc.topologyEpoch;
    expect(doc.seek(0)).toBe(true);
    expect(doc.mesh.vertexCount).toBe(6);
    expect(doc.topologyEpoch).toBe(epoch + 1);
  });
});

function octahedron(): { positions: Float32Array; indices: Uint32Array } {
  return {
    positions: Float32Array.from([1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1]),
    indices: Uint32Array.from([0, 2, 4, 2, 1, 4, 1, 3, 4, 3, 0, 4, 2, 0, 5, 1, 2, 5, 3, 1, 5, 0, 3, 5]),
  };
}

describe('multires', () => {
  it('Loop subdivision quadruples the faces and keeps a closed mesh closed', () => {
    const o = octahedron();
    const topo = buildSubdivision(6, o.indices);
    expect(topo.indices.length / 3).toBe(32);
    expect(topo.edgeA.length).toBe(12);
    const mesh = new EditableMesh({ positions: subdividePositions(topo, o.positions), indices: topo.indices });
    expect(mesh.vertexCount).toBe(18);
    expect(mesh.isClosed()).toBe(true);
    // Loop smooths: corners pull in from radius 1.
    expect(Math.hypot(mesh.positions[0]!, mesh.positions[1]!, mesh.positions[2]!)).toBeLessThan(1);
  });

  it('keeps detail per level: sculpt high, step down, step up — the detail is still there', () => {
    const o = octahedron();
    const m = new Multires(o);
    m.subdivide();
    m.subdivide();
    const top = m.level.positions;
    top[100 * 3 + 1]! += 0.25;
    const sculpted = top.slice();
    m.setLevel(0);
    expect(m.level.positions.length).toBe(18);
    m.setLevel(2);
    for (let i = 0; i < sculpted.length; i += 1) expect(m.level.positions[i]).toBeCloseTo(sculpted[i]!, 5);
  });

  it('a change at a low level carries the high-level detail along', () => {
    const m = new Multires(octahedron());
    m.subdivide();
    m.level.positions[10 * 3 + 2]! += 0.1; // detail on level 1
    const detailed = m.level.positions[10 * 3 + 2]!;
    m.setLevel(0);
    for (let i = 0; i < m.level.positions.length; i += 3) m.level.positions[i + 1]! += 0.5; // move everything up
    m.setLevel(1);
    expect(m.level.positions[10 * 3 + 2]).toBeCloseTo(detailed, 5);
    expect(m.level.positions[10 * 3 + 1]).toBeGreaterThan(0.4);
  });

  it('refuses to subdivide past the vertex ceiling', () => {
    const m = new Multires(octahedron());
    expect(() => m.subdivide(10)).toThrow(/vertices/);
  });

  it('level steps are undoable in the document', () => {
    const doc = new SculptDocument(octahedron());
    doc.subdivide();
    expect(doc.levels()).toEqual({ levels: [0, 1], current: 1 });
    doc.setLevel(0);
    expect(doc.mesh.vertexCount).toBe(6);
    expect(doc.revision).toBe(2);
    doc.seek(1);
    expect(doc.mesh.vertexCount).toBe(18);
  });
});
