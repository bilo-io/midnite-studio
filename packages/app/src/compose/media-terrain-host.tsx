import type { TerrainHost } from '@midnite/studio-feature-media-terrain/renderer';

import { IconSelect } from '../components/icon-select';
import { Modal } from '../components/modal';
import { focusMapCapture } from './media-map/focus-map-capture';
import { HeightmapPromptDialog } from './media-terrain/heightmap-prompt-dialog';

/**
 * Studio's side of the Terrain feature's host port (Phase 113 Theme S).
 *
 * "Show on map" posts to the Maps feature's focus store and opens Studio's Maps tab (`focusMapCapture` —
 * Terrain may not import Maps, so this adapter, which may import both, is where they meet). The modal and
 * icon dropdown are Studio's own, with its dismiss stack and focus trap. The heightmap prompt is made of
 * Images' provider picker and preferences, which stay in `features/media/image`.
 *
 * Installed by Studio's Media view (`features/media/media-view.tsx`), not by `StudioProviders`, for the
 * same entry-chunk reason as the other tab hosts.
 */
export const STUDIO_TERRAIN_HOST = {
  showOnMap: focusMapCapture,
  HeightmapPromptDialog,
  chrome: { Modal, Select: IconSelect },
} satisfies TerrainHost;
