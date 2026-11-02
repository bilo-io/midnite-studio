export { createAnimationLibrary, type AddResult, type AnimationLibrary, type AnimationLibraryDeps, type NewClip } from './animation-library';
export { createAnimationService, unavailableAnimations, type AnimationService, type AnimationServiceDeps } from './animation-service';
export { createAnimationImporter, collectClipFiles, type AnimationImporter } from './import-service';
export { autoTags } from './auto-tags';
export { clipNameFromFile, detectMixamo } from './mixamo';
export { ClipParseError, type ClipMeta } from './clip-meta';
