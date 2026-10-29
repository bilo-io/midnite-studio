import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS } from '@midnite/studio-shared';

/**
 * The companion feature (Phase 123 Theme F) — the panel, orb, thread, voice and zen stage in the
 * renderer, and the snapshot, digest, ask, STT and TTS services in main.
 *
 * Contributes no view and no settings page: the companion is a panel every app mounts, and its
 * Settings ▸ Companion pages stay registered with the settings view that renders them. It owns
 * the thirteen `mstudio:companion:*` request channels (eleven invokes, two sends) and the one event main pushes (a UI request the
 * renderer answers over `companionUiReply`).
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process composer reads this file too.
 */
export const companionManifest = defineFeatureManifest({
  feature: 'companion',
  owner: 'frame',
  views: [],
  settingsPages: [],
  ipc: [
    CHANNELS.companionSnapshot,
    CHANNELS.companionDigest,
    CHANNELS.companionAsk,
    CHANNELS.companionTtsSynthesize,
    CHANNELS.companionTtsStatus,
    CHANNELS.companionTtsReload,
    CHANNELS.companionTtsModelOnDisk,
    CHANNELS.companionTranscribe,
    CHANNELS.companionSttStatus,
    CHANNELS.companionSttSet,
    CHANNELS.companionSttTest,
  ],
  sends: [CHANNELS.companionUiReply, CHANNELS.companionTtsCancel],
  events: [EVENT_CHANNELS.companionUiRequest],
  mcpTools: [],
});

export type CompanionManifest = typeof companionManifest;
