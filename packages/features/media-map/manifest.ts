import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS, MAP_MCP_TOOL_IDS } from '@midnite/studio-shared';

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
  // `map_list`, `map_measure`, `map_goto` and `map_capture_terrain`, owned by Gamer; handlers stay in the MCP server.
  mcpTools: [...MAP_MCP_TOOL_IDS],
});

export type MediaMapManifest = typeof mediaMapManifest;
