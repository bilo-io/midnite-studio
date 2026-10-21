import { useMapFocus, type MapFocusRequest } from '@midnite/studio-feature-media-map/renderer';

import { useUiStore } from '../../store/ui-store';

/**
 * "Show on map" from a terrain a capture made (Phase 108 Theme F): posts the request to Maps' focus
 * store and brings Studio's Maps tab up. The one half of the hand-off a feature cannot do for itself —
 * Terrain reaches it through its host (`showOnMap`), never by importing the Maps feature.
 */
export function focusMapCapture(request: MapFocusRequest): void {
  useMapFocus.getState().focus(request);
  useUiStore.getState().openMedia('map');
}
