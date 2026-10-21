import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS } from '@midnite/studio-shared';

/**
 * Media ▸ Images as a feature (Phase 113 Theme Q) — generated and collected
 * images under `.midnite/media/image/`, a masonry gallery, a lightbox and the
 * create panel, with generation through Gemini, OpenAI, Antigravity or Ollama.
 *
 * One of the packages split from the `media` folder (`FEATURE_PACKAGE_SPLITS`):
 * a tab, not a view — the app hands `mediaImagesTab` to media-core's
 * `MediaShell`. Files are media-core's store; this feature's main half owns
 * generation. Provider keys are read in main through the composer's
 * `readKey` (the vault) and never cross IPC.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process
 * composer reads this file too.
 */
export const mediaImagesManifest = defineFeatureManifest({
  feature: 'media',
  owner: 'creator',
  views: [],
  settingsPages: [],
  ipc: [CHANNELS.mediaImageProviders, CHANNELS.mediaImageGenerate, CHANNELS.mediaImageCancel],
  events: [EVENT_CHANNELS.mediaImageProgress],
  mcpTools: [],
});

export type MediaImagesManifest = typeof mediaImagesManifest;
