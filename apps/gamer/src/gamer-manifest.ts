import { mediaCoreManifest } from '@midnite/studio-feature-media-core/renderer';
import { mediaGameManifest, mediaGameTab } from '@midnite/studio-feature-media-game/renderer';
import { mediaMapManifest, mediaMapTab } from '@midnite/studio-feature-media-map/renderer';
import { mediaSpriteManifest, mediaSpriteTab } from '@midnite/studio-feature-media-sprite/renderer';
import { mediaTerrainManifest, mediaTerrainTab } from '@midnite/studio-feature-media-terrain/renderer';
import type { MediaTabDescriptor } from '@midnite/studio-frame';

/**
 * Gamer's app manifest — pure data (Phase 113 Theme S).
 *
 * `accent` matches the launcher catalog's `gamer` tile; the glyph is the catalog's too
 * (`PiGameControllerFill`, rendered by the home view and baked into `resources/icon.icns` by
 * `scripts/make-icon.mjs`). Gamer opens on the Games tab, with Maps, Terrain and Sprites beside it. Models
 * and the play-test loop follow in later slices.
 */
export const GAMER_APP = {
  id: 'gamer',
  name: 'Midnite Gamer',
  tagline: 'Maps, terrains, sprites and games',
  accent: '#10b981',
  home: 'media',
  features: [
    mediaCoreManifest.feature,
    mediaGameManifest.feature,
    mediaMapManifest.feature,
    mediaTerrainManifest.feature,
    mediaSpriteManifest.feature,
  ],
} as const;

/** The tabs Gamer registers with its `MediaShell`, in strip order. */
export const GAMER_TABS: readonly MediaTabDescriptor[] = [mediaGameTab, mediaMapTab, mediaTerrainTab, mediaSpriteTab];

export type GamerApp = typeof GAMER_APP;
