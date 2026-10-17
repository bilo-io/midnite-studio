/**
 * Messages between the editor and the sculpt worker (Phase 104 Themes A and D).
 *
 * The worker owns the live `SculptDocument` — mesh, BVH, mask, multires stack and per-stroke history;
 * the editor holds a display copy in three `BufferAttribute`s. Requests carry an `id` the reply echoes.
 * Geometry crosses as transferable typed arrays — after `load` the worker posts only the vertex range a
 * dab changed (an {@link SculptEdit}), which the display copies in and re-uploads with `addUpdateRange`;
 * a topology change (subdivide, level step, remesh, or an undo across one) posts the whole new mesh.
 */
import type { MaskDelta, MeshDelta, Mat4, RemeshOptions, SculptBrush, SculptSymmetry, SdfTree, StrokeSummary } from '@midnite/studio-shared';

export type Vec3 = [number, number, number];

export type SculptRay = { origin: Vec3; dir: Vec3 };

export type SculptRequest =
  /** Opens a `.mesh.bin`; `revision` is the part's (what undo counts from). */
  | { type: 'load'; id: number; bytes: ArrayBuffer; revision?: number }
  | { type: 'strokeBegin'; id: number; brush: SculptBrush; symmetry: SculptSymmetry; toWorld?: Mat4 }
  /** One pointer sample of the stroke: a ray in mesh space, and the pen's pressure. */
  | { type: 'strokeTo'; id: number; origin: Vec3; dir: Vec3; pressure?: number }
  | { type: 'strokeEnd'; id: number }
  /** The surface under the pointer, for the brush cursor. */
  | { type: 'raycast'; id: number; origin: Vec3; dir: Vec3 }
  | { type: 'mask'; id: number; op: 'invert' | 'clear' }
  | { type: 'subdivide'; id: number }
  | { type: 'level'; id: number; level: number }
  | { type: 'voxelRemesh'; id: number; options: RemeshOptions }
  /** Walk undo/redo to a revision (the spec's part says which). */
  | { type: 'seek'; id: number; revision: number }
  | { type: 'serialize'; id: number }
  /**
   * Voxel remesh of a triangle soup (Theme B's conversion). Needs no loaded mesh: it is a pure function
   * of its input, run here so a few hundred ms of distance field never blocks the editor.
   */
  | { type: 'remesh'; id: number; positions: Float64Array; indices: Uint32Array; groups: Uint16Array; options: RemeshOptions }
  /** Bake a signed-distance tree (Theme C) — like `remesh`, a pure function of its input. */
  | { type: 'sdfBake'; id: number; tree: SdfTree; resolution: number }
  | { type: 'dispose'; id: number };

export type SculptLoaded = {
  vertices: number;
  triangles: number;
  multiresLevel: number;
  /** Multires level numbers held this session, lowest first. */
  levels: number[];
  revision: number;
  /** The display's own copies (transferred), to build the `BufferGeometry` from. */
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  mask: Float32Array;
};

export type SculptDelta = MeshDelta;
export type SculptMaskDelta = MaskDelta;
export type SculptHit = { point: Vec3; normal: Vec3 };

export type SculptResponse =
  | { type: 'loaded'; id: number; mesh: SculptLoaded }
  | { type: 'ok'; id: number }
  /** A dab, a stroke's end or a mask edit: the changed ranges, the surface under the pointer, and the revision now. */
  | { type: 'edit'; id: number; revision: number; delta: SculptDelta | null; mask: SculptMaskDelta | null; hit: SculptHit | null; summary?: StrokeSummary | null; changed?: boolean }
  | { type: 'topology'; id: number; revision: number; mesh: SculptLoaded; voxelSize?: number; coarsened?: boolean }
  /** `ok: false` — the revision is no longer held; reload the file. `mesh` is set when topology changed on the way. */
  | { type: 'sought'; id: number; ok: boolean; revision: number; delta: SculptDelta | null; mask: SculptMaskDelta | null; mesh?: SculptLoaded }
  | { type: 'hit'; id: number; hit: (SculptHit & { triangle: number; distance: number }) | null }
  | { type: 'serialized'; id: number; bytes: ArrayBuffer; vertices: number; triangles: number; multiresLevel: number; revision: number }
  | { type: 'remeshed'; id: number; positions: Float32Array; indices: Uint32Array; groups: Uint16Array; voxelSize: number; coarsened: boolean }
  | {
      type: 'sdfBaked';
      id: number;
      positions: Float32Array;
      indices: Uint32Array;
      groups: Uint16Array;
      groupTable: { name: string; color: string }[];
      voxelSize: number;
      resolution: number;
      dims: [number, number, number];
      evaluated: number;
      skipped: number;
    }
  | { type: 'disposed'; id: number }
  | { type: 'error'; id: number; message: string };
