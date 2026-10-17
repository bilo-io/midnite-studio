import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS } from '@midnite/studio-shared';

/**
 * Media ▸ Maps as a feature (Phase 113 Theme S): a tab, not a view — the app hands
 * `mediaMapTab` to media-core's `MediaShell`. One of the packages split from the `media` folder
 * (`FEATURE_PACKAGE_SPLITS`), composed by Gamer and by Studio.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process composer reads this file too.
 */
export const mediaMapManifest = defineFeatureManifest({
  feature: 'media',
  owner: 'gamer',
  views: [],
  settingsPages: [],
  ipc: [
    CHANNELS.mediaMapGet,
    CHANNELS.mediaMapSetView,
    CHANNELS.mediaMapSources,
    CHANNELS.mediaMapCache,
    CHANNELS.mediaMapCapture,
    CHANNELS.mediaMapCaptureCancel,
  ],
  events: [EVENT_CHANNELS.mediaMapCaptureProgress, EVENT_CHANNELS.mediaMapOpen],
  mcpTools: [],
});

export type MediaMapManifest = typeof mediaMapManifest;
