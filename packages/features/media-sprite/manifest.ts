import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS, SPRITE_MCP_TOOL_IDS } from '@midnite/studio-shared';

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
  // The `sprite_*` tools plus `tileset_generate`, `background_generate` and the sprite-kind `map_*` tools
  // (`map_generate`, `map_get`, `map_patch`), owned by Gamer; handlers stay in the MCP server.
  mcpTools: [...SPRITE_MCP_TOOL_IDS],
});

export type MediaSpriteManifest = typeof mediaSpriteManifest;
