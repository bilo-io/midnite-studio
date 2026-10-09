export { buildAdjacency, EditableMesh, type MeshArrays, type MeshDelta } from './editable-mesh';
export { Bvh, closestOnTriangle, intersectTriangle, type ClosestHit, type RayHit } from './bvh';
export {
  crc32,
  decodeMeshBin,
  encodeMeshBin,
  MESH_BIN_HEADER_BYTES,
  MESH_BIN_MAGIC,
  MESH_BIN_MAX_TRIANGLES,
  MESH_BIN_MAX_VERTICES,
  MESH_BIN_VERSION,
  MESH_GROUP_NONE,
  MeshBinError,
  readMeshBinHeader,
  sculptMeshSrcFor,
  type MeshBin,
} from './mesh-bin';
export {
  appendOps,
  MODEL_OP_KINDS,
  MODEL_OPS_LINE_MAX,
  MODEL_OPS_LOG_CAP,
  ModelOpEntrySchema,
  opsLogPathFor,
  parseOpsLog,
  rotatedOpsLogPath,
  serializeOp,
  type ModelOpEntry,
  type ModelOpKind,
} from './ops-log';
export { surfaceNets, type FieldGrid, type SurfaceNetsResult } from './surface-nets';
export {
  pointTriangleDistSq,
  REMESH_DEFAULT_TARGET_VERTICES,
  REMESH_MAX_CELLS,
  REMESH_MAX_TARGET_VERTICES,
  REMESH_MIN_VOXEL,
  RemeshError,
  voxelRemesh,
  type RemeshOptions,
  type RemeshResult,
  type RemeshSource,
} from './voxel-remesh';
export { decimateMesh, type DecimateOptions, type DecimateResult, type DecimateSource } from './decimate';
export { retopologize, pairQuads, RETOPO_MAX_FACES, RETOPO_MIN_FACES, type RetopoOptions, type RetopoResult } from './retopo';
export {
  UNWRAP_DEFAULT_ANGLE,
  UNWRAP_DEFAULT_CURVATURE,
  unwrapMesh,
  weldVertices,
  type UnwrapOptions,
  type UnwrapResult,
  type UnwrapSource,
} from './uv';
export {
  BAKE_KINDS,
  BAKE_SIZE_DEFAULT,
  BAKE_SIZE_MAX,
  BAKE_SIZE_MIN,
  bakeMaps,
  vertexCurvature,
  vertexTangents,
  type BakeKind,
  type BakeMesh,
  type BakeOptions,
  type BakeResult,
} from './bake';
export { skinDrift, skinIsNormalised, SKIN_INFLUENCES, transferSkinWeights, type SkinWeights, type TransferOptions } from './skin-transfer';
