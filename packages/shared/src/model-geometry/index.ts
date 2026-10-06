export * from './math';
export {
  applyConversion,
  convertToSculptMesh,
  revertSculptToParts,
  sculptSourceIds,
  type ConvertGroup,
  type ConvertOptions,
  type ConvertResult,
  type ConvertedFile,
} from './convert';
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
  type LocalPart,
  type MeshPart,
  type PartIndex,
  type ResolvedMaterial,
} from './scene';
export * from './quat';
export {
  clearModelAssets,
  hasModelAsset,
  MODEL_ASSET_CACHE_LIMIT,
  meshBinToAsset,
  missingModelAssets,
  missingSculptMeshes,
  modelAsset,
  modelAssetBounds,
  modelAssetEpoch,
  modelAssetHash,
  modelAssetPath,
  parseGlbMesh,
  registerModelAsset,
  registerSculptMesh,
  subscribeModelAssets,
  type ModelAssetMesh,
  type ModelAssetTexture,
} from './assets';
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
  assetSkin,
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
export { RIG_EXAMPLE_BIPED, RIG_EXAMPLE_QUADRUPED, RIG_EXAMPLE_VEHICLE } from './rig-examples';
export { applyClipOps, applyRigOps, copyClips, setAnatomy, type RigEditIssue, type RigEditOutcome } from './rig-ops';
export * from './mesh';
