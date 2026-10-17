import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS } from '@midnite/studio-shared';

/**
 * Media ▸ Library as a feature (Phase 113 Theme R) — folders the user points at, scanned for films,
 * shows, music and photos; local artwork and metadata first, an opt-in online provider second; watch
 * progress and a continue-watching row; local playback.
 *
 * One of the packages split from the `media` folder (`FEATURE_PACKAGE_SPLITS`): a tab, not a view —
 * Studio hands `mediaLibraryTab` to its media view and Midnite Media to media-core's `MediaShell`.
 * Bytes reach the renderer over the existing `mstudio-file:` scheme (host `library`), resolved through
 * the main half's path jail, so no CSP changes. The online provider's key is read in main through the
 * composer's `readKey` and never crosses IPC.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process composer reads this file too.
 */
export const mediaLibraryManifest = defineFeatureManifest({
  feature: 'media',
  owner: 'media',
  views: [],
  settingsPages: [],
  ipc: [
    CHANNELS.mediaLibraryRoots,
    CHANNELS.mediaLibraryAddRoot,
    CHANNELS.mediaLibraryRemoveRoot,
    CHANNELS.mediaLibraryScan,
    CHANNELS.mediaLibraryItems,
    CHANNELS.mediaLibraryProgress,
    CHANNELS.mediaLibraryClearProgress,
    CHANNELS.mediaLibrarySettingsGet,
    CHANNELS.mediaLibrarySettingsSet,
  ],
  events: [EVENT_CHANNELS.mediaLibraryChanged, EVENT_CHANNELS.mediaLibraryScanProgress],
  mcpTools: [],
});

export type MediaLibraryManifest = typeof mediaLibraryManifest;
