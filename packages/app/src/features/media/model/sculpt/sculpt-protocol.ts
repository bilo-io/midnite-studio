/**
 * Messages between the editor and the sculpt worker (Phase 104 Theme A).
 *
 * The worker owns the live `EditableMesh` and its BVH; the editor holds a display copy in three
 * `BufferAttribute`s. Requests carry an `id` the reply echoes. Geometry crosses as transferable typed
 * arrays — the worker never posts the whole mesh after `load`, only {@link SculptDelta}s for the vertex
 * range a stroke changed, which the display copies in and re-uploads with `addUpdateRange`.
 */
import type { MeshDelta } from '@midnite/studio-shared';

export type Vec3 = [number, number, number];

export type SculptRequest =
  | { type: 'load'; id: number; bytes: ArrayBuffer }
  /**
   * The minimal deformation the worker understands in Theme A: push every vertex within `radius` of
   * `center` along its normal by `amount`, with a smooth falloff. Theme D's brushes replace it; it
   * exists so the load → edit → delta → display → save path is real and tested end to end.
   */
  | { type: 'displace'; id: number; center: Vec3; radius: number; amount: number }
  | { type: 'raycast'; id: number; origin: Vec3; dir: Vec3 }
  | { type: 'serialize'; id: number }
  | { type: 'dispose'; id: number };

export type SculptLoaded = {
  vertices: number;
  triangles: number;
  multiresLevel: number;
  /** The display's own copies (transferred), to build the `BufferGeometry` from. */
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
};

export type SculptDelta = MeshDelta;

export type SculptResponse =
  | { type: 'loaded'; id: number; mesh: SculptLoaded }
  | { type: 'delta'; id: number; delta: SculptDelta | null; moved: number }
  | { type: 'hit'; id: number; hit: { point: Vec3; triangle: number; distance: number } | null }
  | { type: 'serialized'; id: number; bytes: ArrayBuffer; vertices: number; triangles: number }
  | { type: 'disposed'; id: number }
  | { type: 'error'; id: number; message: string };
