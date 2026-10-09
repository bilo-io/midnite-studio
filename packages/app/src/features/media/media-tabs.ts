import type { MediaTab } from '@midnite/studio-shared';
import { LuAudioLines, LuBox, LuClapperboard, LuFileText, LuGamepad2, LuImage, LuMapPin, LuMountain, LuPersonStanding } from 'react-icons/lu';

import type { IconComponent } from '../../components/icon-button';

/** Label + glyph per Media tab (Phase 99 Theme A) — UI copy, so it lives in `app`, not `shared`. */
export const MEDIA_TAB_META: Record<MediaTab, { label: string; icon: IconComponent }> = {
  doc: { label: 'Docs', icon: LuFileText },
  image: { label: 'Images', icon: LuImage },
  video: { label: 'Video', icon: LuClapperboard },
  audio: { label: 'Audio', icon: LuAudioLines },
  map: { label: 'Maps', icon: LuMapPin },
  terrain: { label: 'Terrain', icon: LuMountain },
  model: { label: 'Models', icon: LuBox },
  sprite: { label: 'Sprites', icon: LuPersonStanding },
  game: { label: 'Games', icon: LuGamepad2 },
};

export const mediaTabId = (tab: MediaTab): string => `media-tab-${tab}`;
export const mediaPanelId = (tab: MediaTab): string => `media-panel-${tab}`;
