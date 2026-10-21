import { mediaCoreManifest } from '@midnite/studio-feature-media-core/renderer';
import { mediaAudioManifest, mediaAudioTab } from '@midnite/studio-feature-media-audio/renderer';
import { mediaDocsManifest, mediaDocsTab } from '@midnite/studio-feature-media-docs/renderer';
import { mediaImagesManifest, mediaImagesTab } from '@midnite/studio-feature-media-images/renderer';
import { mediaVideoManifest, mediaVideoTab } from '@midnite/studio-feature-media-video/renderer';
import { slidesManifest } from '@midnite/studio-feature-slides/renderer';
import type { MediaTabDescriptor } from '@midnite/studio-frame';

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

/** The tabs Creator registers with its `MediaShell`, in strip order. */
export const CREATOR_TABS: readonly MediaTabDescriptor[] = [mediaDocsTab, mediaImagesTab, mediaVideoTab, mediaAudioTab];

export type CreatorApp = typeof CREATOR_APP;
