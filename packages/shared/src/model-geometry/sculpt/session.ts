import type { Mat4 } from '../math';
import { Bvh } from '../mesh/bvh';
import { EditableMesh, type MeshDelta } from '../mesh/editable-mesh';
import { decodeMeshBin, encodeMeshBin, MESH_GROUP_NONE } from '../mesh/mesh-bin';
import { voxelRemesh, type RemeshOptions } from '../mesh/voxel-remesh';
import { applyDab, captureGrab, grabDab, type DabRecorder, type GrabCapture, type SculptBrush, type SculptTarget, type V3 } from './brush';
import { Multires, type MultiresSnapshot } from './multires';
import { mirrorDab, mirrorIn, NO_SYMMETRY, type SculptSymmetry } from './symmetry';

/**
 * The live sculpt document (Phase 104 Theme D): one mesh, its BVH, mask and multires stack, plus the
 * per-stroke history. The editor's sculpt worker wraps it; Theme E's MCP strokes can drive the same
 * class in main. Everything is part-local space.
 *
 * **History.** Each finished stroke, mask edit, subdivide, level step or remesh is one record and bumps
 * {@link SculptDocument.revision}. Brush and mask records are sparse (the touched vertices before and
 * after); topology records snapshot the multires stack. {@link SculptDocument.seek} walks to any revision
 * still held, which is how the editor's undo (a spec carrying the part's revision) drives the mesh.
 */

export const SCULPT_HISTORY_LIMIT = 100;

export type StrokeSummary = { brush: SculptBrush['brush']; dabs: number; moved: number; masked: number; maxDisplacement: number };

type SparseRecord = {
  kind: 'stroke';
  vertices: Uint32Array;
  before: Float32Array;
  after: Float32Array;
  maskVertices: Uint32Array;
  maskBefore: Float32Array;
  maskAfter: Float32Array;
};
type TopologyRecord = { kind: 'topology'; before: MultiresSnapshot; after: MultiresSnapshot };
type HistoryRecord = SparseRecord | TopologyRecord;

export type MaskDelta = { start: number; end: number; values: Float32Array };

export type SculptSample = {
  /** The pointer ray in mesh space. */
  origin: V3;
  dir: V3;
  /** 0–1 from a tablet; 1 for a mouse. */
  pressure?: number;
};

export type StrokeOptions = {
  symmetry?: SculptSymmetry;
  /** The part's world matrix (row-major), for world-space symmetry. */
  toWorld?: Mat4;
};

/** Grows a typed float buffer by triples or singles as a stroke touches new vertices. */
class Recorder {
  private readonly index = new Map<number, number>();
  private readonly order: number[] = [];
  private values: number[] = [];

  constructor(private readonly width: number) {}

  has(v: number): boolean {
    return this.index.has(v);
  }

  add(v: number, source: ArrayLike<number>): void {
    if (this.index.has(v)) return;
    this.index.set(v, this.order.length);
    this.order.push(v);
    for (let k = 0; k < this.width; k += 1) this.values.push(source[v * this.width + k]!);
  }

  get size(): number {
    return this.order.length;
  }

  /** Vertices in touch order, their before values, and their current values read from `source`. */
  finish(source: ArrayLike<number>): { vertices: Uint32Array; before: Float32Array; after: Float32Array } {
    const vertices = Uint32Array.from(this.order);
    const before = Float32Array.from(this.values);
    const after = new Float32Array(before.length);
    for (let i = 0; i < vertices.length; i += 1) for (let k = 0; k < this.width; k += 1) after[i * this.width + k] = source[vertices[i]! * this.width + k]!;
    return { vertices, before, after };
  }
}

type ActiveStroke = {
  brush: SculptBrush;
  symmetry: SculptSymmetry;
  toWorld: Mat4 | undefined;
  positions: Recorder;
  mask: Recorder;
  dabs: number;
  maxDisplacement: number;
  last: V3 | null;
  /** Distance travelled since the last dab. */
  carry: number;
  grab: { anchor: V3; normal: V3; last: V3; captures: { flip: number; capture: GrabCapture }[] } | null;
};

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V3): V3 => {
  const l = len(a);
  return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, -1];
};

export class SculptDocument {
  multires: Multires;
  mesh: EditableMesh;
  bvh: Bvh;
  private history: HistoryRecord[] = [];
  /** Records dropped off the front of the history (so `revision` keeps counting). */
  private dropped = 0;
  private cursor = 0;
  /** Revision of the state the document was opened at. */
  readonly baseRevision: number;
  private stroke: ActiveStroke | null = null;
  private maskMin = Infinity;
  private maskMax = -1;
  /** Bumps whenever topology changes — the display must rebuild, not patch. */
  topologyEpoch = 0;

  constructor(arrays: { positions: Float32Array; normals?: Float32Array; indices: Uint32Array; groups?: Uint16Array; multiresLevel?: number }, baseRevision = 0) {
    this.multires = new Multires({ positions: arrays.positions, indices: arrays.indices, ...(arrays.groups ? { groups: arrays.groups } : {}) }, arrays.multiresLevel ?? 0);
    this.mesh = new EditableMesh({ positions: arrays.positions, indices: arrays.indices, ...(arrays.normals ? { normals: arrays.normals } : {}) });
    this.bvh = new Bvh(this.mesh.positions, this.mesh.indices);
    this.baseRevision = baseRevision;
  }

  static fromMeshBin(bytes: Uint8Array, baseRevision = 0): SculptDocument {
    return new SculptDocument(decodeMeshBin(bytes), baseRevision);
  }

  get revision(): number {
    return this.baseRevision + this.dropped + this.cursor;
  }

  /** The oldest and newest revisions {@link seek} can reach. */
  get reachable(): { min: number; max: number } {
    return { min: this.baseRevision + this.dropped, max: this.baseRevision + this.dropped + this.history.length };
  }

  get mask(): Float32Array {
    return this.multires.level.mask;
  }

  get groups(): Uint16Array | undefined {
    return this.multires.level.groups;
  }

  get target(): SculptTarget {
    return { mesh: this.mesh, bvh: this.bvh, mask: this.mask };
  }

  get stroking(): boolean {
    return this.stroke !== null;
  }

  /** The surface under a ray, with the triangle's normal (facing the ray). */
  raycast(origin: V3, dir: V3): { point: V3; normal: V3; triangle: number; distance: number } | null {
    const hit = this.bvh.raycast(origin, dir);
    if (!hit) return null;
    const p = this.mesh.positions;
    const i = this.mesh.indices;
    const a = i[hit.triangle * 3]! * 3;
    const b = i[hit.triangle * 3 + 1]! * 3;
    const c = i[hit.triangle * 3 + 2]! * 3;
    const e1: V3 = [p[b]! - p[a]!, p[b + 1]! - p[a + 1]!, p[b + 2]! - p[a + 2]!];
    const e2: V3 = [p[c]! - p[a]!, p[c + 1]! - p[a + 1]!, p[c + 2]! - p[a + 2]!];
    let normal = unit([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]);
    if (normal[0] * dir[0] + normal[1] * dir[1] + normal[2] * dir[2] > 0) normal = [-normal[0], -normal[1], -normal[2]];
    return { point: hit.point, normal, triangle: hit.triangle, distance: hit.distance };
  }

  beginStroke(brush: SculptBrush, options: StrokeOptions = {}): void {
    this.stroke = {
      brush,
      symmetry: options.symmetry ?? NO_SYMMETRY,
      toWorld: options.toWorld,
      positions: new Recorder(3),
      mask: new Recorder(1),
      dabs: 0,
      maxDisplacement: 0,
      last: null,
      carry: 0,
      grab: null,
    };
  }

  /**
   * Continues the stroke under a pointer ray. Returns the surface hit (for the cursor), or `null` when
   * the ray misses — a grab keeps dragging off the surface, along the plane it started on.
   */
  strokeTo(sample: SculptSample): { point: V3; normal: V3 } | null {
    const s = this.stroke;
    if (!s) throw new Error('No stroke is in progress.');
    const view = unit(sample.dir);
    const pressure = Math.min(1, Math.max(0, sample.pressure ?? 1));
    if (s.brush.brush === 'grab' && s.grab) {
      // Ray ∩ the plane through the anchor facing the viewer.
      const denom = view[0] * s.grab.normal[0] + view[1] * s.grab.normal[1] + view[2] * s.grab.normal[2];
      if (Math.abs(denom) < 1e-9) return null;
      const to = sub(s.grab.anchor, sample.origin);
      const t = (to[0] * s.grab.normal[0] + to[1] * s.grab.normal[1] + to[2] * s.grab.normal[2]) / denom;
      const point: V3 = [sample.origin[0] + view[0] * t, sample.origin[1] + view[1] * t, sample.origin[2] + view[2] * t];
      this.grabTo(point);
      return { point, normal: s.grab.normal };
    }
    const hit = this.raycast(sample.origin, view);
    if (!hit) return null;
    this.strokeAt(hit.point, view, pressure);
    return { point: hit.point, normal: hit.normal };
  }

  /** Continues the stroke at a surface point (world-space MCP strokes call this directly). */
  strokeAt(point: V3, view: V3, pressure = 1): void {
    const s = this.stroke;
    if (!s) throw new Error('No stroke is in progress.');
    if (s.brush.brush === 'grab') {
      if (!s.grab) this.startGrab(point, view);
      else this.grabTo(point);
      return;
    }
    const step = Math.max(1e-9, s.brush.spacing * s.brush.radius);
    if (!s.last) {
      this.dab(point, view, pressure, undefined);
      s.last = point;
      return;
    }
    const seg = sub(point, s.last);
    const length = len(seg);
    if (length === 0) return;
    const tangent = unit(seg);
    let travelled = step - s.carry;
    // A hair of slack, so dabs that land exactly on the end of a segment are not lost to rounding.
    const slack = step * 1e-6;
    while (travelled <= length + slack) {
      const at: V3 = [s.last[0] + tangent[0] * travelled, s.last[1] + tangent[1] * travelled, s.last[2] + tangent[2] * travelled];
      this.dab(at, view, pressure, tangent);
      travelled += step;
    }
    s.carry = Math.max(0, length - (travelled - step));
    s.last = point;
  }

  private recorder(): DabRecorder {
    const s = this.stroke!;
    return {
      position: (v) => s.positions.add(v, this.mesh.positions),
      mask: (v) => {
        s.mask.add(v, this.mask);
        this.touchMask(v);
      },
    };
  }

  private touchMask(v: number): void {
    if (v < this.maskMin) this.maskMin = v;
    if (v > this.maskMax) this.maskMax = v;
  }

  private dab(center: V3, view: V3, pressure: number, tangent: V3 | undefined): void {
    const s = this.stroke!;
    const record = this.recorder();
    for (const copy of mirrorDab({ center, view, ...(tangent ? { tangent } : {}) }, s.symmetry, s.toWorld, s.brush.radius)) {
      const result = applyDab(
        this.target,
        {
          brush: s.brush.brush,
          center: copy.center,
          radius: s.brush.radius,
          strength: s.brush.strength * pressure,
          falloff: s.brush.falloff,
          ...(s.brush.invert ? { invert: true } : {}),
          ...(copy.view ? { view: copy.view } : {}),
          ...(s.brush.frontFacesOnly ? { frontFacesOnly: true } : {}),
          ...(copy.tangent ? { tangent: copy.tangent } : {}),
        },
        record,
      );
      if (result.maxDisplacement > s.maxDisplacement) s.maxDisplacement = result.maxDisplacement;
    }
    s.dabs += 1;
  }

  private startGrab(point: V3, view: V3): void {
    const s = this.stroke!;
    const normal: V3 = [-view[0], -view[1], -view[2]];
    const captures = mirrorDab({ center: point, view }, s.symmetry, s.toWorld, s.brush.radius).map((copy) => ({
      flip: copy.flip,
      capture: captureGrab(this.target, {
        center: copy.center,
        radius: s.brush.radius,
        strength: s.brush.strength,
        falloff: s.brush.falloff,
        ...(copy.view ? { view: copy.view } : {}),
        ...(s.brush.frontFacesOnly ? { frontFacesOnly: true } : {}),
      }),
    }));
    s.grab = { anchor: point, normal, last: point, captures };
    s.dabs += 1;
  }

  private grabTo(point: V3): void {
    const s = this.stroke!;
    const g = s.grab!;
    const delta = sub(point, g.last);
    if (len(delta) === 0) return;
    const record = this.recorder();
    for (const { flip, capture } of g.captures) {
      const d = mirrorIn(delta, flip, s.symmetry.space, s.toWorld, false);
      const result = grabDab(this.target, capture, d, record);
      if (result.maxDisplacement > s.maxDisplacement) s.maxDisplacement = result.maxDisplacement;
    }
    g.last = point;
    s.dabs += 1;
  }

  /** Ends the stroke: one history record when it changed anything, `null` when it did not. */
  endStroke(): StrokeSummary | null {
    const s = this.stroke;
    this.stroke = null;
    if (!s || (s.positions.size === 0 && s.mask.size === 0)) return null;
    const pos = s.positions.finish(this.mesh.positions);
    const mask = s.mask.finish(this.mask);
    this.push({ kind: 'stroke', vertices: pos.vertices, before: pos.before, after: pos.after, maskVertices: mask.vertices, maskBefore: mask.before, maskAfter: mask.after });
    this.bvh.refit();
    return { brush: s.brush.brush, dabs: s.dabs, moved: pos.vertices.length, masked: mask.vertices.length, maxDisplacement: s.maxDisplacement };
  }

  /** Invert or clear the mask as one history step; `false` when it changed nothing. */
  maskOp(op: 'invert' | 'clear'): boolean {
    const mask = this.mask;
    const rec = new Recorder(1);
    for (let v = 0; v < mask.length; v += 1) {
      const next = op === 'invert' ? 1 - mask[v]! : 0;
      if (next === mask[v]) continue;
      rec.add(v, mask);
      mask[v] = next;
      this.touchMask(v);
    }
    if (rec.size === 0) return false;
    const m = rec.finish(mask);
    this.push({ kind: 'stroke', vertices: new Uint32Array(), before: new Float32Array(), after: new Float32Array(), maskVertices: m.vertices, maskBefore: m.before, maskAfter: m.after });
    return true;
  }

  /** Adds a multires level (Loop subdivision) as one history step. */
  subdivide(maxVertices?: number): void {
    this.topology(() => this.multires.subdivide(maxVertices));
  }

  /** Steps to multires level `level` (the number a file records) as one history step. */
  setLevel(level: number): void {
    const index = level - this.multires.baseLevel;
    if (index === this.multires.current) return;
    this.topology(() => this.multires.setLevel(index));
  }

  /** Voxel remesh of the current level (Theme B's remesher) — evens out stretched topology; drops the multires stack. */
  remesh(options: RemeshOptions): { voxelSize: number; coarsened: boolean } {
    let info = { voxelSize: 0, coarsened: false };
    this.topology(() => {
      const level = this.multires.level;
      const groups = level.groups;
      let triangleGroups: Uint16Array | undefined;
      if (groups) {
        triangleGroups = new Uint16Array(level.indices.length / 3);
        for (let t = 0; t < triangleGroups.length; t += 1) triangleGroups[t] = groups[level.indices[t * 3]!] ?? MESH_GROUP_NONE;
      }
      const out = voxelRemesh({ positions: Float64Array.from(level.positions), indices: level.indices, ...(triangleGroups ? { groups: triangleGroups } : {}) }, options);
      info = { voxelSize: out.voxelSize, coarsened: out.coarsened };
      this.multires = new Multires({ positions: out.positions, indices: out.indices, ...(groups ? { groups: out.groups } : {}) }, 0);
    });
    return info;
  }

  private topology(change: () => void): void {
    if (this.stroke) throw new Error('Finish the stroke first.');
    const before = this.multires.snapshot();
    change();
    this.rebuild();
    this.push({ kind: 'topology', before, after: this.multires.snapshot() });
  }

  /** Re-wraps the current multires level after a topology change. */
  private rebuild(): void {
    const level = this.multires.level;
    this.mesh = new EditableMesh({ positions: level.positions, indices: level.indices });
    this.bvh = new Bvh(this.mesh.positions, this.mesh.indices);
    this.maskMin = Infinity;
    this.maskMax = -1;
    this.topologyEpoch += 1;
  }

  private push(record: HistoryRecord): void {
    this.history.length = this.cursor;
    this.history.push(record);
    this.cursor += 1;
    while (this.history.length > SCULPT_HISTORY_LIMIT) {
      this.history.shift();
      this.dropped += 1;
      this.cursor -= 1;
    }
  }

  /**
   * Walks undo/redo to `revision`. Returns `false` (changing nothing) when the revision is no longer held —
   * the caller reloads the file instead.
   */
  seek(revision: number): boolean {
    if (this.stroke) this.endStroke();
    const { min, max } = this.reachable;
    if (revision < min || revision > max) return false;
    const target = revision - this.baseRevision - this.dropped;
    while (this.cursor > target) {
      this.cursor -= 1;
      this.applyRecord(this.history[this.cursor]!, 'undo');
    }
    while (this.cursor < target) {
      this.applyRecord(this.history[this.cursor]!, 'redo');
      this.cursor += 1;
    }
    return true;
  }

  private applyRecord(record: HistoryRecord, direction: 'undo' | 'redo'): void {
    if (record.kind === 'topology') {
      this.multires = Multires.restore(direction === 'undo' ? record.before : record.after);
      this.rebuild();
      return;
    }
    const values = direction === 'undo' ? record.before : record.after;
    for (let i = 0; i < record.vertices.length; i += 1) this.mesh.setPosition(record.vertices[i]!, values[i * 3]!, values[i * 3 + 1]!, values[i * 3 + 2]!);
    const maskValues = direction === 'undo' ? record.maskBefore : record.maskAfter;
    const mask = this.mask;
    for (let i = 0; i < record.maskVertices.length; i += 1) {
      const v = record.maskVertices[i]!;
      mask[v] = maskValues[i]!;
      this.touchMask(v);
    }
    if (record.vertices.length > 0) this.bvh.refit();
  }

  /** Changes since the last call: the vertex range to re-upload, and the mask range. */
  takeDelta(): { delta: MeshDelta | null; mask: MaskDelta | null } {
    const delta = this.mesh.takeDelta();
    let mask: MaskDelta | null = null;
    if (this.maskMax >= this.maskMin) {
      mask = { start: this.maskMin, end: this.maskMax + 1, values: this.mask.slice(this.maskMin, this.maskMax + 1) };
      this.maskMin = Infinity;
      this.maskMax = -1;
    }
    return { delta, mask };
  }

  /** Copies of the current level for a display to own. */
  displayArrays(): { positions: Float32Array; normals: Float32Array; indices: Uint32Array; mask: Float32Array } {
    this.mesh.updateNormals();
    return { positions: this.mesh.positions.slice(), normals: this.mesh.normals.slice(), indices: this.mesh.indices.slice(), mask: this.mask.slice() };
  }

  /** The current level as `.mesh.bin` bytes (the multires stack below and above it is session-only). */
  serialize(): Uint8Array {
    this.mesh.updateNormals();
    const groups = this.groups;
    return encodeMeshBin({ positions: this.mesh.positions, normals: this.mesh.normals, indices: this.mesh.indices, multiresLevel: this.multires.levelNumber, ...(groups ? { groups } : {}) });
  }

  /** Multires level numbers this session holds, lowest first, and the current one. */
  levels(): { levels: number[]; current: number } {
    return { levels: this.multires.levels.map((_, i) => this.multires.baseLevel + i), current: this.multires.levelNumber };
  }
}

