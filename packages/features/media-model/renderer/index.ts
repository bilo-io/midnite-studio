import { LuBox, LuFootprints } from 'react-icons/lu';

import type { MediaTabDescriptor } from '@midnite/studio-frame';

import { AnimationTab } from './animation/animation-tab';
import { ModelTab } from './model-tab';

/**
 * Media ▸ Models' renderer half (Phase 113 Theme S). It never imports media-core: the layout, explorer chrome
 * and data hooks come through the frame's `useMediaKit()`, which the app's `MediaShell` installs, and what
 * the app owns — the AI composer with its engine picker and voice, the agent roster, the tree sections and
 * their persisted state, the licence modal, the toolbar selects and the JSON code view — comes through
 * {@link ModelHost}, every member optional.
 *
 * The helpers below the tab are what other apps' composers read: Studio's Sprites host (rigged models, the
 * map engine and the 3D render job), the Games agent panel (the engine's providers) and the notes revealer.
 */
export { mediaModelManifest, type MediaModelManifest } from '../manifest';
export {
  ModelHostProvider,
  useModelHost,
  type ModelAgent,
  type ModelComposerProps,
  type ModelHost,
  type ModelIconSelectOption,
  type ModelIconSelectProps,
  type ModelModalProps,
  type ModelPickerProvider,
  type ModelTreeCollapse,
  type ModelTreeSectionProps,
} from './host';
export * from './events';
export { ModelTab } from './model-tab';
export * from './kernel';
export { useMapEngine } from './map-engine';
export { modelSpriteSeams } from './sprite-seams';
export { resetMigrationMemo, useModelLibrary } from './use-model-library';

/** The Models tab, for an app's `MediaShell` registry. */
export const mediaModelTab = {
  id: 'model',
  label: 'Models',
  icon: LuBox,
  Component: ModelTab,
} as const satisfies MediaTabDescriptor;

/** The Animations tab (Phase 125): the global library of animation clips, beside Models. */
export const mediaAnimationTab = {
  id: 'animation',
  label: 'Animations',
  icon: LuFootprints,
  Component: AnimationTab,
} as const satisfies MediaTabDescriptor;
export { filterClips, tagCounts, sourceCounts, type ClipFilter } from './animation/animation-model';
