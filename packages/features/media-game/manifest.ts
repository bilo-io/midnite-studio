import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS, GAME_MCP_TOOL_IDS } from '@midnite/studio-shared';

/**
 * Media ▸ Games as a feature (Phase 113 Theme S): a tab, not a view — the app hands
 * `mediaGameTab` to media-core's `MediaShell`. One of the packages split from the `media` folder
 * (`FEATURE_PACKAGE_SPLITS`), composed by Gamer and by Studio.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process composer reads this file too.
 */
export const mediaGameManifest = defineFeatureManifest({
  feature: 'media',
  owner: 'gamer',
  views: [],
  settingsPages: [],
  ipc: [
    CHANNELS.gamesSettingsGet,
    CHANNELS.gamesSettingsSet,
    CHANNELS.gamesList,
    CHANNELS.gamesCreate,
    CHANNELS.gamesAdd,
    CHANNELS.gamesRename,
    CHANNELS.gamesForget,
    CHANNELS.gamesReveal,
    CHANNELS.gamesDeleteInfo,
    CHANNELS.gamesDelete,
    CHANNELS.gamesGetManifest,
    CHANNELS.gamesSetManifest,
    CHANNELS.gamesRun,
    CHANNELS.gamesStop,
    CHANNELS.gamesReload,
    CHANNELS.gamesSetBounds,
    CHANNELS.gamesSetVisible,
    CHANNELS.gamesToolbar,
    CHANNELS.gamesJuice,
    CHANNELS.gamesLogs,
    CHANNELS.gamesKitUpgrade,
    CHANNELS.gamesDoctor,
    CHANNELS.gamesDoctorFix,
    CHANNELS.gamesLevels,
    CHANNELS.gamesLevelGet,
    CHANNELS.gamesLevelSet,
    CHANNELS.gamesLevelMapAsset,
    CHANNELS.gamesLevelModel,
    CHANNELS.gamesLevelPrefabs,
    CHANNELS.gamesLevelPrefabGet,
    CHANNELS.gamesLevelPrefabSet,
    CHANNELS.gamesLevelPrefabDelete,
    CHANNELS.gamesLevelAssetThumb,
    CHANNELS.gamesLevelPreview,
    CHANNELS.gamesLevelPreviewEnd,
    CHANNELS.gamesLevelEditorReply,
    CHANNELS.gamesLevelEditorOpen,
    CHANNELS.gamesGoto,
    CHANNELS.gamesEntities,
    CHANNELS.gamesEntitiesWatch,
    CHANNELS.gamesDebug,
    CHANNELS.gamesNavMesh,
    CHANNELS.gamesPopOut,
    CHANNELS.gamesPopped,
    CHANNELS.gamesAgentRun,
    CHANNELS.gamesAgentCancel,
    CHANNELS.gamesAgentUndo,
    CHANNELS.gamesAssetSources,
    CHANNELS.gamesLibraryList,
    CHANNELS.gamesLibraryRead,
    CHANNELS.gamesLibraryImport,
    CHANNELS.gamesImportAsset,
    CHANNELS.gamesResync,
    CHANNELS.gamesPlaytests,
    CHANNELS.gamesPlaytestRun,
    CHANNELS.gamesExport,
  ],
  events: [EVENT_CHANNELS.gamesChanged, EVENT_CHANNELS.gamesLevelEditorRequest, EVENT_CHANNELS.gamesRunState, EVENT_CHANNELS.gamesEntityState, EVENT_CHANNELS.gamesConsole, EVENT_CHANNELS.gamesOpen, EVENT_CHANNELS.gamesPopState, EVENT_CHANNELS.gamesAgentProgress],
  // The `game_*` tools. Gamer owns them (`FEATURE_PACKAGE_SPLITS`), so a Gamer-only install lists them and a
  // Creator-only one does not. Their handlers stay with the MCP server (Studio's `main/mcp`); only ownership lives here.
  mcpTools: [...GAME_MCP_TOOL_IDS],
});

export type MediaGameManifest = typeof mediaGameManifest;
