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
 * generation and import, and the music editor's song store and exports. The
 * editor itself (Audio's second sub-tab: arrangement, piano roll, mixer, GM
 * sampler) lives here too rather than in a package of its own — it opens
 * Audio's projects and sends its renders to the Generator, and a second
 * feature package could not import this one. What needs Studio's agents (the
 * song chat) comes through the host port.
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
    // The music editor's song store, exports and General MIDI samples. Its agent run, chat thread
    // and Antigravity registration stay Studio's (they need agents), registered by Studio's main.
    CHANNELS.mediaMusicList,
    CHANNELS.mediaMusicRead,
    CHANNELS.mediaMusicWrite,
    CHANNELS.mediaMusicImport,
    CHANNELS.mediaMusicDelete,
    CHANNELS.mediaMusicExport,
    CHANNELS.mediaMusicSendToGenerator,
    CHANNELS.mediaGmStatus,
    CHANNELS.mediaGmEnsure,
    CHANNELS.mediaGmLoad,
  ],
  events: [EVENT_CHANNELS.mediaAudioProgress, EVENT_CHANNELS.mediaAudioEngineProgress, EVENT_CHANNELS.mediaGmProgress],
  // The `music_*` tools an agent edits songs with. Creator owns them (`FEATURE_PACKAGE_SPLITS`), so a
  // Creator-only install lists them and an Agents-only one does not. Their handlers stay with the MCP
  // server (Studio's `main/mcp`); only ownership lives here.
  mcpTools: [
    'music_list',
    'music_open',
    'music_get_info',
    'music_set_tempo',
    'music_get_tracks',
    'music_get_track',
    'music_get_notes',
    'music_add_notes',
    'music_remove_notes',
    'music_add_cc',
    'music_add_pitchbends',
    'music_add_track',
    'music_save',
    'music_render_preview',
  ],
});

export type MediaAudioManifest = typeof mediaAudioManifest;
