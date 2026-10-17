import { mediaCoreManifest } from '@midnite/studio-feature-media-core/renderer';
import { mediaGameManifest, mediaGameTab } from '@midnite/studio-feature-media-game/renderer';
import { mediaMapManifest, mediaMapTab } from '@midnite/studio-feature-media-map/renderer';
import { mediaModelManifest, mediaModelTab } from '@midnite/studio-feature-media-model/renderer';
import { mediaSpriteManifest, mediaSpriteTab } from '@midnite/studio-feature-media-sprite/renderer';
import { mediaTerrainManifest, mediaTerrainTab } from '@midnite/studio-feature-media-terrain/renderer';
import type { MediaTabDescriptor } from '@midnite/studio-frame';

/**
 * Gamer's app manifest — pure data (Phase 113 Theme S).
 *
 * `accent` matches the launcher catalog's `gamer` tile; the glyph is the catalog's too
 * (`PiGameControllerFill`, rendered by the home view and baked into `resources/icon.icns` by
 * `scripts/make-icon.mjs`). Gamer opens on the Games tab, with Maps, Terrain, Models and Sprites beside it.
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
} as const;

/** The tabs Gamer registers with its `MediaShell`, in strip order (`MEDIA_TABS`'s: the Models tab sits before Sprites). */
export const GAMER_TABS: readonly MediaTabDescriptor[] = [mediaGameTab, mediaMapTab, mediaTerrainTab, mediaModelTab, mediaSpriteTab];

export type GamerApp = typeof GAMER_APP;
