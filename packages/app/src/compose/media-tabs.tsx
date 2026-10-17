import { mediaAudioTab } from '@midnite/studio-feature-media-audio/renderer';
import { mediaDocsTab } from '@midnite/studio-feature-media-docs/renderer';
import { mediaGameTab } from '@midnite/studio-feature-media-game/renderer';
import { mediaImagesTab } from '@midnite/studio-feature-media-images/renderer';
import { mediaMapTab } from '@midnite/studio-feature-media-map/renderer';
import { mediaModelTab } from '@midnite/studio-feature-media-model/renderer';
import { mediaSpriteTab } from '@midnite/studio-feature-media-sprite/renderer';
import { mediaTerrainTab } from '@midnite/studio-feature-media-terrain/renderer';
import { mediaVideoTab } from '@midnite/studio-feature-media-video/renderer';
import { MEDIA_TABS, type MediaTab } from '@midnite/studio-shared';
import type { MediaTabDescriptor } from '@midnite/studio-frame';

/**
 * Studio's media tab registry (Phase 113 Themes Q and S) — every tab, in the strip order `MEDIA_TABS` has
 * always had, each from its feature package: Docs, Images, Video and Audio (Creator's), and Maps, Terrain,
 * Sprites, Models and Games (Gamer's). Imported only by the lazily loaded Media view, so the tabs stay out of
 * the entry chunk as they always were.
 */
const FEATURE_TABS: Record<MediaTab, MediaTabDescriptor> = {
  doc: mediaDocsTab,
  image: mediaImagesTab,
  audio: mediaAudioTab,
  video: mediaVideoTab,
  map: mediaMapTab,
  terrain: mediaTerrainTab,
  sprite: mediaSpriteTab,
  model: mediaModelTab,
  game: mediaGameTab,
};

export const STUDIO_MEDIA_TABS: readonly MediaTabDescriptor[] = MEDIA_TABS.map((id) => FEATURE_TABS[id]);
