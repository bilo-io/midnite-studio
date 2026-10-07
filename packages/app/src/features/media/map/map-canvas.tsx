import { mapSource, mapTileUrl, type MapView } from '@midnite/studio-shared';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, type KeyboardEvent, type ReactNode, type Ref } from 'react';

import { frameFeatures, resizedSide, samplePoints, type LonLat } from './map-frame';
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
  /** 3D preview (Theme C): `setTerrain` over the Terrarium DEM, pitch eased to 60 / back to 0. */
  terrain3d?: { on: boolean; exaggeration: number };
  /** The capture frame, `null` while hidden. Square in metres, so it is drawn from the kernel, not the screen. */
  frame?: { center: LonLat; sideM: number } | null;
  onFrameChange?: (frame: { center: LonLat; sideM: number }) => void;
  /** Min/max elevation sampled inside the frame from the loaded preview tiles; `null` when 3D is off. */
  onElevation?: (range: { min: number; max: number } | null) => void;
  onToggleFrame?: () => void;
  onToggle3d?: () => void;
  handleRef?: Ref<MapCanvasHandle>;
  children?: ReactNode;
};

export type MapCanvasHandle = { resetNorth: () => void };

export const TERRAIN_3D_PITCH = 60;
const FRAME_SRC = 'capture-frame';
const HANDLE_SRC = 'capture-frame-handles';
const ELEVATION_INTERVAL_MS = 250;
const EMPTY = { type: 'FeatureCollection' as const, features: [] };

function readView(map: maplibregl.Map): MapView {
  const c = map.getCenter();
  return {
    center: [Math.max(-180, Math.min(180, c.lng)), Math.max(-90, Math.min(90, c.lat))],
    zoom: Math.max(0, Math.min(22, map.getZoom())),
    bearing: Math.max(-180, Math.min(180, map.getBearing())),
    pitch: Math.max(0, Math.min(85, map.getPitch())),
  };
}

export default function MapCanvas({
  style,
  view,
  onViewChange,
  attribution,
  reloadKey = 0,
  terrain3d = { on: false, exaggeration: 1.5 },
  frame = null,
  onFrameChange,
  onElevation,
  onToggleFrame,
  onToggle3d,
  handleRef,
  children,
}: MapCanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  // Latest props for handlers installed once at creation.
  const live = useRef({ terrain3d, frame, onFrameChange, onElevation, onToggleFrame, onToggle3d });
  live.current = { terrain3d, frame, onFrameChange, onElevation, onToggleFrame, onToggle3d };
  const sampleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hadTerrain = useRef(terrain3d.on);

  const sampleElevation = () => {
    if (sampleTimer.current) return;
    sampleTimer.current = setTimeout(() => {
      sampleTimer.current = null;
      const map = mapRef.current;
      const { frame: f, terrain3d: t, onElevation: report } = live.current;
      if (!map || !report) return;
      if (!f || !t.on) return report(null);
      let min = Infinity;
      let max = -Infinity;
      for (const p of samplePoints(f)) {
        const e = map.queryTerrainElevation(p);
        if (typeof e !== 'number' || !Number.isFinite(e)) continue;
        const metres = e / t.exaggeration;
        if (metres < min) min = metres;
        if (metres > max) max = metres;
      }
      report(Number.isFinite(min) ? { min, max } : null);
    }, ELEVATION_INTERVAL_MS);
  };

  /** (Re-)adds the DEM, the hillshade, the terrain and the frame layers; a `setStyle` wipes all of them. */
  const applyOverlays = (map: maplibregl.Map) => {
    const { terrain3d: t, frame: f } = live.current;
    if (!map.getSource('dem')) {
      const dem = mapSource('aws-terrarium');
      map.addSource('dem', { type: 'raster-dem', tiles: [mapTileUrl('aws-terrarium')], tileSize: dem.tileSize, maxzoom: dem.maxZoom, encoding: 'terrarium' });
    }
    if (t.on && !map.getLayer('hillshade') && !map.getLayer('hillshade-3d')) {
      map.addLayer({ id: 'hillshade-3d', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': 0.35 } });
    }
    map.setTerrain(t.on ? { source: 'dem', exaggeration: t.exaggeration } : null);
    const shapes = f ? frameFeatures(f) : { outline: EMPTY, handles: EMPTY };
    const setData = (id: string, data: object) => (map.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(data as never);
    if (!map.getSource(FRAME_SRC)) {
      map.addSource(FRAME_SRC, { type: 'geojson', data: shapes.outline as never });
      map.addSource(HANDLE_SRC, { type: 'geojson', data: shapes.handles as never });
      map.addLayer({ id: 'capture-frame-fill', type: 'fill', source: FRAME_SRC, paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.1 } });
      map.addLayer({ id: 'capture-frame-line', type: 'line', source: FRAME_SRC, paint: { 'line-color': '#f59e0b', 'line-width': 2 } });
      map.addLayer({
        id: 'capture-frame-handles',
        type: 'circle',
        source: HANDLE_SRC,
        paint: { 'circle-radius': 8, 'circle-color': '#ffffff', 'circle-stroke-color': '#f59e0b', 'circle-stroke-width': 2 },
      });
    } else {
      setData(FRAME_SRC, shapes.outline);
      setData(HANDLE_SRC, shapes.handles);
    }
  };
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
      keyboard: false, // the wrapper owns the keys (arrows, +/-, F, T) so they never reach a text field
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

    // Frame drag: the interior moves it, a corner handle resizes it about the centre.
    let drag: { kind: 'move' | 'resize'; grab: LonLat; origin: LonLat } | null = null;
    const startDrag = (kind: 'move' | 'resize') => (e: maplibregl.MapMouseEvent) => {
      const f = live.current.frame;
      if (!f || (drag && kind === 'move')) return;
      e.preventDefault();
      drag = { kind, grab: [e.lngLat.lng, e.lngLat.lat], origin: f.center };
      map.dragPan.disable();
    };
    const onMove = (e: maplibregl.MapMouseEvent) => {
      const f = live.current.frame;
      if (!drag || !f) return;
      if (drag.kind === 'move') {
        const center: LonLat = [drag.origin[0] + e.lngLat.lng - drag.grab[0], drag.origin[1] + e.lngLat.lat - drag.grab[1]];
        live.current.onFrameChange?.({ center, sideM: f.sideM });
      } else {
        live.current.onFrameChange?.({ center: f.center, sideM: resizedSide(f.center, [e.lngLat.lng, e.lngLat.lat]) });
      }
    };
    const endDrag = () => {
      if (!drag) return;
      drag = null;
      map.dragPan.enable();
    };
    map.on('style.load', () => applyOverlays(map));
    map.on('mousedown', 'capture-frame-handles', startDrag('resize'));
    map.on('mousedown', 'capture-frame-fill', startDrag('move'));
    map.on('mousemove', onMove);
    map.on('mouseup', endDrag);
    map.on('idle', sampleElevation);

    const observer = new ResizeObserver(() => map.resize());
    observer.observe(el);

    return () => {
      observer.disconnect();
      if (sampleTimer.current) clearTimeout(sampleTimer.current);
      sampleTimer.current = null;
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

  // 3D toggle / exaggeration: re-apply on the live map; pitch eases only on a real on/off flip.
  const { on, exaggeration } = terrain3d;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) applyOverlays(map);
    if (hadTerrain.current !== on) map.easeTo({ pitch: on ? TERRAIN_3D_PITCH : 0 });
    hadTerrain.current = on;
    sampleElevation();
  }, [on, exaggeration]);

  // Frame edits redraw the polygon in place.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const shapes = frame ? frameFeatures(frame) : { outline: EMPTY, handles: EMPTY };
    (map.getSource(FRAME_SRC) as maplibregl.GeoJSONSource | undefined)?.setData(shapes.outline as never);
    (map.getSource(HANDLE_SRC) as maplibregl.GeoJSONSource | undefined)?.setData(shapes.handles as never);
    sampleElevation();
  }, [frame]);

  useEffect(() => {
    if (!handleRef) return;
    const handle: MapCanvasHandle = { resetNorth: () => mapRef.current?.easeTo({ bearing: 0 }) };
    if (typeof handleRef === 'function') handleRef(handle);
    else (handleRef as { current: MapCanvasHandle | null }).current = handle;
  }, [handleRef]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target !== e.currentTarget && target.closest('input, textarea, select, button, [contenteditable="true"]')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const map = mapRef.current;
    if (!map) return;
    const step = e.shiftKey ? 400 : 100;
    const pan: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (pan[e.key]) map.panBy(pan[e.key]!);
    else if (e.key === '+' || e.key === '=') map.zoomIn();
    else if (e.key === '-' || e.key === '_') map.zoomOut();
    else if (e.key === 'f' || e.key === 'F') live.current.onToggleFrame?.();
    else if (e.key === 't' || e.key === 'T') live.current.onToggle3d?.();
    else return;
    e.preventDefault();
  };

  return (
    <div
      className="relative h-full w-full outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
      data-testid="map-canvas"
      role="application"
      aria-label="Map"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      {/* maplibre-gl.css gives `.maplibregl-map` position: relative, which would beat an `absolute inset-0` here. */}
      <div ref={container} className="h-full w-full" />
      {children}
    </div>
  );
}
