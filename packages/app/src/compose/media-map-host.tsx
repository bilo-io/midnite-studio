import type { MapHost } from '@midnite/studio-feature-media-map/renderer';

import { useUiStore } from '../store/ui-store';

/**
 * Studio's side of the Maps feature's host port (Phase 113 Theme S): the measurement units stay in the
 * persisted `ui-store` (`mapUnits`, chosen in Settings ▸ Media), so moving Maps into a package changed no
 * stored key.
 *
 * Installed by Studio's Media view (`features/media/media-view.tsx`), not by `StudioProviders`, for the
 * same entry-chunk reason as the other tab hosts.
 */
export const STUDIO_MAP_HOST = {
  useUnits: () => useUiStore((s) => s.mapUnits),
} satisfies MapHost;
