import { mediaCoreManifest } from '@midnite/studio-feature-media-core/renderer';
import { mediaLibraryManifest, mediaLibraryTab } from '@midnite/studio-feature-media-library/renderer';
import { navFromModules, type MediaTabDescriptor, type NavConfig } from '@midnite/studio-frame';
import { APP_MODULES } from '@midnite/studio-shared';
import { PiMonitorPlayFill } from 'react-icons/pi';
import { mediaManifest } from '../manifest';

/** The tabs Media registers with its `MediaShell`, in strip order. */
export const MEDIA_TABS: readonly MediaTabDescriptor[] = [mediaLibraryTab];

/**
 * The shell's rail (Phase 123 Theme B): one row per media tab, from the same descriptors the
 * `MediaShell` strip reads, so the two cannot drift. Settings is never listed — `AppShell` puts it at
 * the rail's foot. `panels` is absent, so the app carries every panel (decision 12).
 */
const MEDIA_NAV: NavConfig = { views: MEDIA_TABS.map(({ id, label, icon }) => ({ id, label, icon })) };

/**
 * The rail, derived from `APP_MODULES.media` (Phase 124 Theme E.2): one titled group per module the host mounts,
 * this module's views beneath. Modules the host does not mount yet have no entry, so wiring one in (E.3) adds
 * its group here and nothing else.
 */
const MEDIA_HOST_NAV: NavConfig = navFromModules(APP_MODULES.media, {
  media: { id: 'media', label: mediaManifest.label, icon: PiMonitorPlayFill, accent: mediaManifest.accent, views: MEDIA_NAV.views },
});

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
  nav: MEDIA_HOST_NAV,
} as const;

export type MediaApp = typeof MEDIA_APP;
