import { LuMapPin } from 'react-icons/lu';

import type { MediaTabDescriptor } from '@midnite/studio-frame';

import { MapTab } from './map-tab';

/**
 * Media ▸ Maps' renderer half (Phase 113 Theme S). It never imports media-core: the layout, explorer
 * chrome and data hooks come through the frame's `useMediaKit()`, which the app's `MediaShell` installs,
 * and the little that differs per app — the measurement units — comes through {@link MapHost}.
 */
export { mediaMapManifest, type MediaMapManifest } from '../manifest';
export { MapHostProvider, useMapHost, useMapUnits, type MapHost, type MapUnits } from './host';
export { useMapFocus, zoomForSide, type MapFocusRequest } from './map-focus';
export { useMapPlaceStore, type MapPlace } from './map-place-store';
export { SAVE_DEBOUNCE_MS, useMapCache, useSaveMapView } from './use-map';
export { LAYER_WRITE_DEBOUNCE_MS, useMapLayers, type MapLayers } from './use-map-layers';
export { BAD_LAYER_TEXT, MapLayerList } from './map-layer-list';
export { MapPanel } from './map-panel';
export { MapCaptureSection } from './map-capture-section';

/** The Maps tab, for an app's `MediaShell` registry. */
export const mediaMapTab = {
  id: 'map',
  label: 'Maps',
  icon: LuMapPin,
  Component: MapTab,
} as const satisfies MediaTabDescriptor;
