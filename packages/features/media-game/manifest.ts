import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS } from '@midnite/studio-shared';

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
    CHANNELS.gamesPopOut,
    CHANNELS.gamesPopped,
    CHANNELS.gamesAgentRun,
    CHANNELS.gamesAgentCancel,
    CHANNELS.gamesAgentUndo,
    CHANNELS.gamesAssetSources,
    CHANNELS.gamesImportAsset,
    CHANNELS.gamesResync,
    CHANNELS.gamesPlaytests,
    CHANNELS.gamesPlaytestRun,
    CHANNELS.gamesExport,
  ],
  events: [EVENT_CHANNELS.gamesChanged, EVENT_CHANNELS.gamesRunState, EVENT_CHANNELS.gamesConsole, EVENT_CHANNELS.gamesOpen, EVENT_CHANNELS.gamesPopState, EVENT_CHANNELS.gamesAgentProgress],
  mcpTools: [],
});

export type MediaGameManifest = typeof mediaGameManifest;
