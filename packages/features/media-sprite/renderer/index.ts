import { LuPersonStanding } from 'react-icons/lu';

import type { MediaTabDescriptor } from '@midnite/studio-frame';

import { SpriteTab } from './sprite-tab';

/**
 * Media ▸ Sprites' renderer half (Phase 113 Theme S). It never imports media-core: the layout, explorer
 * chrome and data hooks come through the frame's `useMediaKit()`, which the app's `MediaShell` installs,
 * and what the Model tab and Studio own — the AI composer, the rigged-model library, the map-layout
 * engine and the 3D render job — comes through {@link SpriteHost}, every member optional.
 */
export { mediaSpriteManifest, type MediaSpriteManifest } from '../manifest';
export {
  SpriteHostProvider,
  useSpriteHost,
  type RiggedModel,
  type SpriteComposerPicker,
  type SpriteComposerProps,
  type SpriteHost,
  type SpriteRenderJobApi,
  type SpriteRenderJobModule,
} from './host';
export * from './events';
export { SpriteCreatePanel } from './sprite-create-panel';
export { SpriteAnimator } from './sprite-animator';
export { SpriteExplorer } from './sprite-explorer';
export { handOffBlocker, SpriteOneShotPanel } from './sprite-one-shot-panel';
export { SpriteReferenceCard } from './sprite-reference-card';
export { SpriteEnvironmentPreview } from './sprite-environment-preview';
export { SpriteTab } from './sprite-tab';
export { useSprite, useSpriteActions, type SpriteRef } from './use-sprite';

/** The Sprites tab, for an app's `MediaShell` registry. */
export const mediaSpriteTab = {
  id: 'sprite',
  label: 'Sprites',
  icon: LuPersonStanding,
  Component: SpriteTab,
} as const satisfies MediaTabDescriptor;
