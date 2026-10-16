import { mediaCoreManifest } from '@midnite/studio-feature-media-core/renderer';
import { mediaDocsManifest, mediaDocsTab } from '@midnite/studio-feature-media-docs/renderer';
import { mediaImagesManifest, mediaImagesTab } from '@midnite/studio-feature-media-images/renderer';
import type { MediaTabDescriptor } from '@midnite/studio-frame';

/**
 * Creator's app manifest — pure data (Phase 113 Theme Q).
 *
 * `accent` matches the launcher catalog's `creator` tile; the glyph is the catalog's too
 * (`PiPaletteFill`, rendered by the home view and baked into `resources/icon.icns` by
 * `scripts/make-icon.mjs`). Creator opens on the media shell; `tabs` is its registry — Docs
 * and Images for now, Audio, Video and Slides as Theme Q's later slices extract them.
 */
export const CREATOR_APP = {
  id: 'creator',
  name: 'Midnite Creator',
  tagline: 'Docs and images, every asset a file',
  accent: '#ec4899',
  home: 'media',
  features: [mediaCoreManifest.feature, mediaDocsManifest.feature, mediaImagesManifest.feature],
} as const;

/** The tabs Creator registers with its `MediaShell`, in strip order. */
export const CREATOR_TABS: readonly MediaTabDescriptor[] = [mediaDocsTab, mediaImagesTab];

export type CreatorApp = typeof CREATOR_APP;
