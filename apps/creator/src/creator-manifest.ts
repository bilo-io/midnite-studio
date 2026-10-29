import { mediaCoreManifest } from '@midnite/studio-feature-media-core/renderer';
import { mediaAudioManifest } from '@midnite/studio-feature-media-audio/renderer';
import { mediaDocsManifest } from '@midnite/studio-feature-media-docs/renderer';
import { mediaImagesManifest } from '@midnite/studio-feature-media-images/renderer';
import { mediaVideoManifest } from '@midnite/studio-feature-media-video/renderer';
import { slidesManifest } from '@midnite/studio-feature-slides/renderer';
import { CREATOR_TABS } from '@midnite/studio-module-creator/renderer';

/**
 * Creator's app manifest — pure data (Phase 113 Theme Q).
 *
 * `accent` matches the launcher catalog's `creator` tile; the glyph is the catalog's too
 * (`PiPaletteFill`, rendered by the home view and baked into `resources/icon.icns` by
 * the launcher's `scripts/app-icons.cjs`). Creator opens on the media shell; `tabs` is its registry — Docs,
 * Images, Video and Audio; Slides is not a tab — a doc's Present button opens its deck.
 */
export const CREATOR_APP = {
  id: 'creator',
  name: 'Midnite Creator',
  tagline: 'Docs and images, every asset a file',
  accent: '#ec4899',
  home: 'media',
  features: [mediaCoreManifest.feature, mediaDocsManifest.feature, mediaImagesManifest.feature, mediaVideoManifest.feature, mediaAudioManifest.feature, slidesManifest.feature],
} as const;

/** The tabs Creator registers with its `MediaShell`, in strip order — the module's. */
export { CREATOR_TABS };

export type CreatorApp = typeof CREATOR_APP;
