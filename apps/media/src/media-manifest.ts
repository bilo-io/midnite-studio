import { mediaCoreManifest } from '@midnite/studio-feature-media-core/renderer';
import { mediaLibraryManifest, mediaLibraryTab } from '@midnite/studio-feature-media-library/renderer';
import type { MediaTabDescriptor, NavConfig } from '@midnite/studio-frame';

/** The tabs Media registers with its `MediaShell`, in strip order. */
export const MEDIA_TABS: readonly MediaTabDescriptor[] = [mediaLibraryTab];

/**
 * The shell's rail (Phase 123 Theme B): one row per media tab, from the same descriptors the
 * `MediaShell` strip reads, so the two cannot drift. Settings is never listed — `AppShell` puts it at
 * the rail's foot. `panels` is absent, so the app carries every panel (decision 12).
 */
const MEDIA_NAV: NavConfig = { views: MEDIA_TABS.map(({ id, label, icon }) => ({ id, label, icon })) };

/**
 * Midnite Media's app manifest — pure data (Phase 113 Theme R).
 *
 * `accent` matches the launcher catalog's `media` tile; the glyph is the catalog's too
 * (`PiMonitorPlayFill`, rendered by the home view and baked into `resources/icon.icns` by
 * the launcher's `scripts/app-icons.cjs`). Media opens on the media shell; `tabs` is its registry — the Library, which
 * holds films, shows, music and photos under one tab.
 */
export const MEDIA_APP = {
  id: 'media',
  name: 'Midnite Media',
  tagline: 'Your films, shows, music and photos — from your own folders',
  accent: '#facc15',
  home: 'media',
  features: [mediaCoreManifest.feature, mediaLibraryManifest.feature],
  nav: MEDIA_NAV,
} as const;

export type MediaApp = typeof MEDIA_APP;
