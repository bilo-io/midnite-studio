import type { MapView } from '@midnite/studio-shared';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, type ReactNode } from 'react';

import type { MapStyleSpec } from './map-style';
import { mapStatusStore } from './use-map-status';

/**
 * The MapLibre host (Phase 108 Theme A) — the only file that imports `maplibre-gl`, so the library and
 * its stylesheet ride one lazy chunk (`map-canvas-lazy.tsx`). One `maplibregl.Map` per mount; the
 * container is resize-observed, and unmount calls `remove()` *and* releases the WebGL context, so
 * opening and closing the tab never leaks a context.
 */
export type MapCanvasProps = {
  style: MapStyleSpec;
  view: MapView;
  /** Fires on `moveend` with the settled viewport (the tab debounces the write). */
  onViewChange: (view: MapView) => void;
  /** De-duplicated attribution strings, shown always (never the compact "i" button). */
  attribution: string[];
  /** Bump to re-apply the style, e.g. from the offline panel's Retry. */
  reloadKey?: number;
  children?: ReactNode;
};

function readView(map: maplibregl.Map): MapView {
  const c = map.getCenter();
  return {
    center: [Math.max(-180, Math.min(180, c.lng)), Math.max(-90, Math.min(90, c.lat))],
    zoom: Math.max(0, Math.min(22, map.getZoom())),
    bearing: Math.max(-180, Math.min(180, map.getBearing())),
    pitch: Math.max(0, Math.min(85, map.getPitch())),
  };
}

export default function MapCanvas({ style, view, onViewChange, attribution, reloadKey = 0, children }: MapCanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  // The creation-time view and style; later changes go through setStyle, never a re-create.
  const initial = useRef({ style, view, attribution });

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    mapStatusStore.reset();
    const { style: s, view: v, attribution: a } = initial.current;
    const map = new maplibregl.Map({
      container: el,
      style: s as unknown as maplibregl.StyleSpecification,
      center: v.center,
      zoom: v.zoom,
      bearing: v.bearing,
      pitch: v.pitch,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: false, customAttribution: a }), 'bottom-right');
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-left');

    const onMoveEnd = () => onViewChangeRef.current(readView(map));
    // Tile failures are counted, never logged one by one.
    const onError = (event: { error?: Error & { status?: number }; sourceId?: string }) => {
      const status = event.error?.status;
      if (event.sourceId) mapStatusStore.recordTileError(event.sourceId, status === undefined ? 'network' : String(status));
      else mapStatusStore.patch({ styleFailed: true });
    };
    const onData = () => mapStatusStore.patch({ loading: !map.areTilesLoaded() });
    const onIdle = () => mapStatusStore.patch({ loading: false, styleFailed: false });
    map.on('moveend', onMoveEnd);
    map.on('error', onError);
    map.on('dataloading', onData);
    map.on('data', onData);
    map.on('idle', onIdle);

    const observer = new ResizeObserver(() => map.resize());
    observer.observe(el);

    return () => {
      observer.disconnect();
      const gl = map.getCanvas().getContext('webgl2') as WebGL2RenderingContext | null;
      map.remove();
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
      mapRef.current = null;
      mapStatusStore.reset();
    };
  }, []);

  // A basemap switch or Retry re-applies the style on the same map.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    mapRef.current?.setStyle(style as unknown as maplibregl.StyleSpecification);
  }, [style, reloadKey]);

  return (
    <div className="relative h-full w-full" data-testid="map-canvas">
      {/* maplibre-gl.css gives `.maplibregl-map` position: relative, which would beat an `absolute inset-0` here. */}
      <div ref={container} className="h-full w-full" />
      {children}
    </div>
  );
}
