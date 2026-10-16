import { mediaDocsTab } from '@midnite/studio-feature-media-docs/renderer';
import { mediaImagesTab } from '@midnite/studio-feature-media-images/renderer';
import { MEDIA_TABS, type MediaTab } from '@midnite/studio-shared';
import type { MediaTabDescriptor } from '@midnite/studio-frame';
import type { ComponentType } from 'react';

import { AudioTab } from '../features/media/audio/audio-tab';
import { GameTab } from '../features/media/game/game-tab';
import { MapTab } from '../features/media/map/map-tab';
import { MEDIA_TAB_META } from '../features/media/media-tabs';
import { ModelTab } from '../features/media/model/model-tab';
import { SpriteTab } from '../features/media/sprite/sprite-tab';
import { TerrainTab } from '../features/media/terrain/terrain-tab';
import { VideoTab } from '../features/media/video/video-tab';

/**
 * Studio's media tab registry (Phase 113 Theme Q) — every tab, in the strip
 * order `MEDIA_TABS` has always had: Docs and Images from their feature
 * packages, the other seven still from `packages/app`. Imported only by the lazily loaded
 * Media view, so the tabs stay out of the entry chunk as they always were.
 */
type AppTab = Exclude<MediaTab, 'doc' | 'image'>;

const BODY: Record<AppTab, ComponentType> = {
  video: VideoTab,
  audio: AudioTab,
  map: MapTab,
  terrain: TerrainTab,
  model: ModelTab,
  sprite: SpriteTab,
  game: GameTab,
};

const FEATURE_TABS: Partial<Record<MediaTab, MediaTabDescriptor>> = {
  doc: mediaDocsTab,
  image: mediaImagesTab,
};

export const STUDIO_MEDIA_TABS: readonly MediaTabDescriptor[] = MEDIA_TABS.map(
  (id) => FEATURE_TABS[id] ?? { id, ...MEDIA_TAB_META[id], Component: BODY[id as AppTab] },
);
