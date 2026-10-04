export * from './math';
export { csg, CSG_MAX_TRIANGLES, type CsgOutcome } from './csg';
export {
  applyModifiers,
  arraySoup,
  bendSoup,
  bevelSoup,
  loopSubdivide,
  mirrorSoup,
  radialArraySoup,
  taperSoup,
  tessellate,
  twistSoup,
  type ModifierResult,
} from './modifiers';
export { buildLocalMesh, DEFAULT_SEGMENTS, samplePath } from './primitives';
export {
  bounds,
  flipWinding,
  isClosed,
  signedVolume,
  smoothNormals,
  triangulatePolygon,
  weld,
  type RawMesh,
  type Soup,
} from './raw';
export {
  buildPartLocal,
  buildScene,
  buildSceneChecked,
  DEFAULT_MATERIAL,
  descendantIndices,
  hexColor,
  indexParts,
  parentIndices,
  parentWorldMatrix,
  partLocalMatrix,
  resolveMaterial,
  resolveRef,
  sceneBounds,
  sceneStats,
  semanticIssues,
  worldMatrices,
  type BuildIssue,
  type BuildOptions,
  type BuildResult,
  type MeshPart,
  type PartIndex,
  type ResolvedMaterial,
} from './scene';
export * from './quat';
export {
  autoRig,
  facingBasis,
  partAncestry,
  resolveRig,
  validateRig,
  type Basis,
  type ResolvedRig,
  type RigBone,
} from './rig';
export {
  boneLocal,
  boneWorldMatrices,
  computeSkin,
  MAX_INFLUENCES,
  partBindings,
  restPose,
  skinMatrices,
  skinParts,
  type BonePose,
  type PartSkin,
  type Pose,
} from './skin';
export { bakeClip, boneNamesFor, CLIP_BAKE_FPS, retargetClips, samplePose, type BakedClip } from './clips';
