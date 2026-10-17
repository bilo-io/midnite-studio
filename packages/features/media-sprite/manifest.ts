import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS } from '@midnite/studio-shared';

/**
 * Media ▸ Sprites as a feature (Phase 113 Theme S): a tab, not a view — the app hands
 * `mediaSpriteTab` to media-core's `MediaShell`. One of the packages split from the `media` folder
 * (`FEATURE_PACKAGE_SPLITS`), composed by Gamer and by Studio.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process composer reads this file too.
 */
export const mediaSpriteManifest = defineFeatureManifest({
  feature: 'media',
  owner: 'gamer',
  views: [],
  settingsPages: [],
  ipc: [
    CHANNELS.mediaSpriteLibrary,
    CHANNELS.mediaSpriteGet,
    CHANNELS.mediaSpriteSetSpec,
    CHANNELS.mediaSpriteSetReference,
    CHANNELS.mediaSpriteGenerate,
    CHANNELS.mediaSpriteCancel,
    CHANNELS.mediaSpritePatchFrames,
    CHANNELS.mediaSpriteExport,
    CHANNELS.mediaSpriteImportMap,
    CHANNELS.mediaSpriteRenderReady,
    CHANNELS.mediaSpriteRenderFrames,
  ],
  events: [EVENT_CHANNELS.mediaSpriteProgress, EVENT_CHANNELS.mediaSpriteChanged, EVENT_CHANNELS.mediaSpriteOpen, EVENT_CHANNELS.mediaSpriteRenderRequest],
  mcpTools: [],
});

export type MediaSpriteManifest = typeof mediaSpriteManifest;
