import { buildSceneChecked, modelAssetEpoch, sceneStats, semanticIssues, validateRig, type BuildIssue, type MeshPart, type ModelSpec } from '@midnite/studio-shared';
import { BufferGeometry, Float32BufferAttribute } from 'three';

/**
 * The editor's geometry **is** the exported geometry: one kernel (`@midnite/studio-shared`
 * `model-geometry`) builds the world-space meshes that `.obj` / `.fbx` / `.glb` and the PNG
 * previews are written from, and this file only wraps them as three.js buffers. Booleans,
 * modifiers, groups and instances are therefore exactly what the files will contain.
 */
export type EditorScene = {
  parts: MeshPart[];
  /** Hard reference problems first, then rig problems, then build warnings (a failed boolean, a capped modifier). */
  issues: BuildIssue[];
  stats: { triangles: number; vertices: number; parts: number };
};

const cache = new WeakMap<ModelSpec, { epoch: number; scene: EditorScene }>();

/**
 * Builds (and memoises per spec object) every mesh of a design, boolean operands included. The memo
 * also keys on the asset registry's epoch, so an imported mesh that finishes loading is drawn.
 */
export function editorScene(spec: ModelSpec): EditorScene {
  const epoch = modelAssetEpoch();
  const hit = cache.get(spec);
  if (hit && hit.epoch === epoch) return hit.scene;
  const built = buildSceneChecked(spec, { operands: true });
  const scene: EditorScene = {
    parts: built.parts,
    issues: [...semanticIssues(spec), ...validateRig(spec), ...built.issues],
    stats: sceneStats(built.parts.filter((p) => p.role === 'solid')),
  };
  cache.set(spec, { epoch, scene });
  return scene;
}

/** A world-space mesh as a three.js geometry (rendered at identity). */
export function meshGeometry(part: MeshPart): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(part.positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(part.normals, 3));
  if (part.uvs && part.uvs.length === (part.positions.length / 3) * 2) geometry.setAttribute('uv', new Float32BufferAttribute(part.uvs, 2));
  geometry.setIndex(part.indices);
  geometry.computeBoundingSphere();
  return geometry;
}
