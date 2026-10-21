import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS, TERRAIN_MCP_TOOL_IDS } from '@midnite/studio-shared';

/**
 * Media ▸ Terrain as a feature (Phase 113 Theme S): a tab, not a view — the app hands
 * `mediaTerrainTab` to media-core's `MediaShell`. One of the packages split from the `media` folder
 * (`FEATURE_PACKAGE_SPLITS`), composed by Gamer and by Studio.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process composer reads this file too.
 */
export const mediaTerrainManifest = defineFeatureManifest({
  feature: 'media',
  owner: 'gamer',
  views: [],
  settingsPages: [],
  ipc: [
    CHANNELS.mediaTerrainLibrary,
    CHANNELS.mediaTerrainGet,
    CHANNELS.mediaTerrainSetSpec,
    CHANNELS.mediaTerrainSetInput,
    CHANNELS.mediaTerrainBuild,
    CHANNELS.mediaTerrainCancel,
    CHANNELS.mediaTerrainPaint,
    CHANNELS.mediaTerrainRoadKey,
    CHANNELS.mediaTerrainExport,
  ],
  events: [EVENT_CHANNELS.mediaTerrainProgress, EVENT_CHANNELS.mediaTerrainChanged, EVENT_CHANNELS.mediaTerrainOpen],
  // The `terrain_*` tools, owned by Gamer; handlers stay in the MCP server.
  mcpTools: [...TERRAIN_MCP_TOOL_IDS],
});

export type MediaTerrainManifest = typeof mediaTerrainManifest;
