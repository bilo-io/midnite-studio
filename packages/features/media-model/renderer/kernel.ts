/**
 * The Model tab's pure geometry, rig, lighting and library helpers (Phase 113 Theme S) — no React component,
 * no kit, no host. Their own entry (`@midnite/studio-feature-media-model/kernel`) because other apps' composers
 * read them: Studio's Sprites host renders a rigged character into sprite frames with the Model tab's own
 * scene builder, and a map's layout engine and the Games agent panel read the engine's models.
 */
export { editorScene, meshGeometry } from './spec-geometry';
export { DEFAULT_LIGHTING, lightingById } from './lighting';
export { assetTexture, loadAsset } from './model-assets';
export { modelFileUrl, pickOllamaModel, textModels } from './model-utils';
export { poseAt, posedScene, rigModel } from './rig-pose';
export { collectModels, joinLibraryPath, splitProjectPath } from './library-tree';
export { riggedModels, type RiggedModel } from './rigged-models';
