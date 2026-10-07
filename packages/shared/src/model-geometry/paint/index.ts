export {
  blendComponent,
  blendWeighted,
  clamp01,
  clonePaintImage,
  combineNormals,
  createPaintImage,
  decodeNormal,
  hexToUnit,
  imageFromChannels,
  sampleBilinear,
  sampleNearest,
  unitToHex,
  type PaintImage,
} from './image';
export { buildTexelMap, PAINT_PADDING, PaintSurface, triangleCharts, type PaintMesh, type TexelMap } from './surface';
export {
  PAINT_BRUSHES,
  PaintBrushSchema,
  PaintStroke,
  STAMP_PATTERNS,
  stampPattern,
  unionRect,
  type BeforeWrite,
  type DirtyRect,
  type PaintBrush,
  type PaintBrushKind,
  type PaintStrokeOptions,
  type StampPattern,
} from './brushes';
export { PAINT_HISTORY_LIMIT, PAINT_TILE, PaintHistory } from './history';
export {
  channelInUse,
  flattenChannel,
  flattenPbr,
  layerTouches,
  ormSize,
  outputsFor,
  packOrmInto,
  type FlattenedSet,
  type FlattenInput,
  type PbrBakes,
  type PbrBase,
  type UvRect,
} from './flatten';
export { PBR_PRESET_STACKS, type PbrPreset } from './presets';
export {
  addPbrLayer,
  applyPbrPreset,
  emptyPbr,
  findPbrLayer,
  freshLayerId,
  removePbrLayer,
  updatePbrLayer,
  type LayerPatch,
  type NewLayer,
  type StackResult,
} from './stack';
