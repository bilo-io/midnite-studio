import { CHANNELS, defineFeatureManifest } from '@midnite/studio-shared';

/**
 * Media ▸ Docs as a feature (Phase 113 Theme Q) — markdown docs under
 * `.midnite/media/doc/`, edited in Tiptap, exported as md/html/pdf, with an
 * AI thread beside each doc where the app has agents.
 *
 * One of the packages split from the `media` folder (`FEATURE_PACKAGE_SPLITS`):
 * it is a tab, not a view, so `views` is empty — the app hands its
 * `mediaDocsTab` descriptor to media-core's `MediaShell`. Reading and writing
 * the docs themselves is media-core's store; this feature's main half owns only
 * what is Docs': the export and the AI edit.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process
 * composer reads this file too.
 */
export const mediaDocsManifest = defineFeatureManifest({
  feature: 'media',
  owner: 'creator',
  views: [],
  settingsPages: [],
  ipc: [CHANNELS.mediaDocExport, CHANNELS.mediaDocEdit],
  events: [],
  mcpTools: [],
});

export type MediaDocsManifest = typeof mediaDocsManifest;
