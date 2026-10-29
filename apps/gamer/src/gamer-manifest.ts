import { mediaCoreManifest } from '@midnite/studio-feature-media-core/renderer';
import { mediaGameManifest, mediaGameTab } from '@midnite/studio-feature-media-game/renderer';
import { mediaMapManifest, mediaMapTab } from '@midnite/studio-feature-media-map/renderer';
import { mediaModelManifest, mediaModelTab } from '@midnite/studio-feature-media-model/renderer';
import { mediaSpriteManifest, mediaSpriteTab } from '@midnite/studio-feature-media-sprite/renderer';
import { mediaTerrainManifest, mediaTerrainTab } from '@midnite/studio-feature-media-terrain/renderer';
import type { MediaTabDescriptor, NavConfig } from '@midnite/studio-frame';

/** The tabs Gamer registers with its `MediaShell`, in strip order (`MEDIA_TABS`'s: the Models tab sits before Sprites). */
export const GAMER_TABS: readonly MediaTabDescriptor[] = [mediaGameTab, mediaMapTab, mediaTerrainTab, mediaModelTab, mediaSpriteTab];

/**
 * The shell's rail (Phase 123 Theme B): one row per media tab, from the same descriptors the
 * `MediaShell` strip reads, so the two cannot drift. Settings is never listed — `AppShell` puts it at
 * the rail's foot. `panels` is absent, so the app carries every panel (decision 12).
 */
const GAMER_NAV: NavConfig = { views: GAMER_TABS.map(({ id, label, icon }) => ({ id, label, icon })) };

/**
 * Gamer's app manifest — pure data (Phase 113 Theme S).
 *
 * `accent` matches the launcher catalog's `gamer` tile; the glyph is the catalog's too
 * (`PiGameControllerFill`, rendered by the home view and baked into `resources/icon.icns` by
 * the launcher's `scripts/app-icons.cjs`). Gamer opens on the Games tab, with Maps, Terrain, Models and Sprites beside it.
 * The play-test loop follows in a later slice.
 */
export const GAMER_APP = {
  id: 'gamer',
  name: 'Midnite Gamer',
  tagline: 'Maps, terrains, models, sprites and games',
  accent: '#10b981',
  home: 'media',
  features: [
    mediaCoreManifest.feature,
    mediaGameManifest.feature,
    mediaMapManifest.feature,
    mediaTerrainManifest.feature,
    mediaModelManifest.feature,
    mediaSpriteManifest.feature,
  ],
  nav: GAMER_NAV,
} as const;

export type GamerApp = typeof GAMER_APP;
