import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS } from '@midnite/studio-shared';

/**
 * Media ▸ Audio as a feature (Phase 113 Theme Q) — songs generated or imported
 * under `.midnite/media/audio/`: the Suno-style prompt form, a session history
 * with its bottom player, the local MusicGen engine and Ollama prompt
 * expansion.
 *
 * One of the packages split from the `media` folder (`FEATURE_PACKAGE_SPLITS`):
 * a tab, not a view — the app hands `mediaAudioTab` to media-core's
 * `MediaShell`. Files are media-core's store; this feature's main half owns
 * generation and import. The music editor (a second sub-tab of Audio) is not
 * here yet — the app supplies it through the host port.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process
 * composer reads this file too.
 */
export const mediaAudioManifest = defineFeatureManifest({
  feature: 'media',
  owner: 'creator',
  views: [],
  settingsPages: [],
  ipc: [
    CHANNELS.mediaAudioProviders,
    CHANNELS.mediaAudioEngine,
    CHANNELS.mediaAudioEngineInstall,
    CHANNELS.mediaAudioGenerate,
    CHANNELS.mediaAudioCancel,
    CHANNELS.mediaAudioExpand,
    CHANNELS.mediaAudioImport,
  ],
  events: [EVENT_CHANNELS.mediaAudioProgress, EVENT_CHANNELS.mediaAudioEngineProgress],
  mcpTools: [],
});

export type MediaAudioManifest = typeof mediaAudioManifest;
