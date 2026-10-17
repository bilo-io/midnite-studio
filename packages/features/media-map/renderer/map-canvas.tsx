import { mapSource, mapTileUrl, type MapView } from '@midnite/studio-shared';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, type KeyboardEvent, type ReactNode, type Ref } from 'react';

import { EMPTY_FC, type GeoFC } from './map-layers';
import { frameFeatures, resizedSide, samplePoints, type LonLat } from './map-frame';
import type { MapTool } from './map-tools';
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
  onToggleFrame?: (view?: MapView) => void;
  onToggle3d?: () => void;
  handleRef?: Ref<MapCanvasHandle>;
  /** The active measure/draw tool (Theme G); `pan` (or absent) leaves clicks to the map. */
  tool?: MapTool;
  /** Every visible layer's features (Theme H), colours folded into `properties`. */
  drawings?: GeoFC;
  /** The in-progress shape and its draggable vertices. */
  draft?: { shape: GeoFC; vertices: GeoFC };
  onMapClick?: (point: LonLat) => void;
  onMapDoubleClick?: (point: LonLat) => void;
  onVertexMove?: (index: number, point: LonLat) => void;
  /** A click on a drawn feature (`fid`), or on empty map (`null`), while the `pan` tool is active. */
  onFeatureClick?: (fid: string | null, shift: boolean) => void;
  onSelectTool?: (tool: MapTool) => void;
  onCancelDraft?: () => void;
  onFinishDraft?: () => void;
  onUndoPoint?: () => void;
  children?: ReactNode;
};

export type MapCanvasHandle = {
  resetNorth: () => void;
  flyTo: (center: LonLat, zoom: number) => void;
  getView: () => MapView | null;
  getCenter: () => LonLat | null;
};

const TOOL_KEYS: Record<string, MapTool> = { d: 'distance', c: 'circle', a: 'area', p: 'pin' };
const DRAWING_LAYERS = ['drawings-fill', 'drawings-line', 'drawings-pin'];

export const TERRAIN_3D_PITCH = 60;
const FRAME_SRC = 'capture-frame';
const HANDLE_SRC = 'capture-frame-handles';
const ELEVATION_INTERVAL_MS = 250;
const EMPTY = { type: 'FeatureCollection' as const, features: [] };
const NO_DRAFT = { shape: EMPTY_FC, vertices: EMPTY_FC };

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
  tool = 'pan',
  drawings = EMPTY_FC,
  draft = NO_DRAFT,
  onMapClick,
  onMapDoubleClick,
  onVertexMove,
  onFeatureClick,
  onSelectTool,
  onCancelDraft,
  onFinishDraft,
  onUndoPoint,
  children,
}: MapCanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  // Latest props for handlers installed once at creation.
  const live = useRef({ terrain3d, frame, onFrameChange, onElevation, onToggleFrame, onToggle3d, tool, drawings, draft, onMapClick, onMapDoubleClick, onVertexMove, onFeatureClick, onSelectTool, onCancelDraft, onFinishDraft, onUndoPoint });
  live.current = { terrain3d, frame, onFrameChange, onElevation, onToggleFrame, onToggle3d, tool, drawings, draft, onMapClick, onMapDoubleClick, onVertexMove, onFeatureClick, onSelectTool, onCancelDraft, onFinishDraft, onUndoPoint };
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
    applyDrawings(map);
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
  /** The drawings and the draft: three GeoJSON sources, re-added after every `setStyle` like the frame. */
  const applyDrawings = (map: maplibregl.Map) => {
    const { drawings: d, draft: dr } = live.current;
    const setData = (id: string, data: object) => (map.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(data as never);
    if (map.getSource('drawings')) {
      setData('drawings', d);
      setData('draft', dr.shape);
      setData('draft-vertices', dr.vertices);
      return;
    }
    map.addSource('drawings', { type: 'geojson', data: d as never });
    map.addSource('draft', { type: 'geojson', data: dr.shape as never });
    map.addSource('draft-vertices', { type: 'geojson', data: dr.vertices as never });
    const color = ['coalesce', ['get', 'color'], '#3b82f6'] as never;
    const selected = (on: number, off: number) => ['case', ['==', ['get', 'selected'], 1], on, off] as never;
    map.addLayer({ id: 'drawings-fill', type: 'fill', source: 'drawings', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': color, 'fill-opacity': selected(0.3, 0.15) } });
    map.addLayer({ id: 'drawings-line', type: 'line', source: 'drawings', filter: ['!=', ['geometry-type'], 'Point'], paint: { 'line-color': color, 'line-width': selected(4, 2.5) } });
    map.addLayer({ id: 'drawings-pin', type: 'circle', source: 'drawings', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': selected(9, 7), 'circle-color': color, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
    // Labels need the style's glyph endpoint; a style without one (tests, offline stubs) simply has none.
    if (map.getStyle().glyphs) {
      map.addLayer({
        id: 'drawings-label',
        type: 'symbol',
        source: 'drawings',
        filter: ['!=', ['get', 'label'], ''],
        layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-anchor': 'top', 'text-offset': [0, 0.9] },
        paint: { 'text-color': '#111827', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
      });
    }
    map.addLayer({ id: 'draft-fill', type: 'fill', source: 'draft', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.15 } });
    map.addLayer({ id: 'draft-line', type: 'line', source: 'draft', paint: { 'line-color': '#f59e0b', 'line-width': 2.5, 'line-dasharray': [2, 1.5] } });
    map.addLayer({ id: 'draft-vertices', type: 'circle', source: 'draft-vertices', paint: { 'circle-radius': 6, 'circle-color': '#ffffff', 'circle-stroke-color': '#f59e0b', 'circle-stroke-width': 2 } });
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
      boxZoom: false, // Shift-click selects a second feature; Shift-drag box-zoom would swallow it
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
      if (!f || (drag && kind === 'move') || live.current.tool !== 'pan') return;
      e.preventDefault();
      drag = { kind, grab: [e.lngLat.lng, e.lngLat.lat], origin: f.center };
      map.dragPan.disable();
    };
    // Draft vertices: drag to adjust; the click that ends the drag must not add a point.
    let vertex: { index: number; moved: boolean } | null = null;
    let swallowClick = false;
    const onMove = (e: maplibregl.MapMouseEvent) => {
      if (vertex) {
        vertex.moved = true;
        live.current.onVertexMove?.(vertex.index, [e.lngLat.lng, e.lngLat.lat]);
        return;
      }
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
      if (vertex) {
        swallowClick = vertex.moved;
        vertex = null;
        map.dragPan.enable();
        return;
      }
      if (!drag) return;
      drag = null;
      map.dragPan.enable();
    };
    map.on('style.load', () => applyOverlays(map));
    map.on('mousedown', 'capture-frame-handles', startDrag('resize'));
    map.on('mousedown', 'capture-frame-fill', startDrag('move'));
    map.on('mousedown', 'draft-vertices', (e) => {
      const index = e.features?.[0]?.properties?.['index'];
      if (typeof index !== 'number') return;
      e.preventDefault();
      vertex = { index, moved: false };
      map.dragPan.disable();
    });
    map.on('click', (e) => {
      if (swallowClick) {
        swallowClick = false;
        return;
      }
      const { tool: t, onMapClick: add, onFeatureClick: pick } = live.current;
      // The second click of a double-click (`detail` 2) is the finish gesture, not another vertex.
      if (t !== 'pan') return e.originalEvent.detail >= 2 ? undefined : add?.([e.lngLat.lng, e.lngLat.lat]);
      const layers = DRAWING_LAYERS.filter((id) => map.getLayer(id));
      const hit = layers.length ? map.queryRenderedFeatures(e.point, { layers })[0] : undefined;
      pick?.(typeof hit?.properties?.['fid'] === 'string' ? (hit.properties['fid'] as string) : null, e.originalEvent.shiftKey);
    });
    map.on('dblclick', (e) => {
      if (live.current.tool === 'pan') return;
      e.preventDefault();
      live.current.onMapDoubleClick?.([e.lngLat.lng, e.lngLat.lat]);
    });
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; handlers read `live`
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `applyOverlays` reads `live`
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

  // Drawings and the draft repaint in place; a drawing tool owns double-click and the cursor.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    applyDrawings(map);
  }, [drawings, draft]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = tool === 'pan' ? '' : 'crosshair';
    if (tool === 'pan') map.doubleClickZoom.enable();
    else map.doubleClickZoom.disable();
  }, [tool]);

  useEffect(() => {
    if (!handleRef) return;
    const handle: MapCanvasHandle = {
      resetNorth: () => mapRef.current?.easeTo({ bearing: 0 }),
      flyTo: (center, zoom) => mapRef.current?.flyTo({ center, zoom }),
      getView: () => (mapRef.current ? readView(mapRef.current) : null),
      getCenter: () => (mapRef.current ? readView(mapRef.current).center : null),
    };
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
    else if (e.key === 'f' || e.key === 'F') live.current.onToggleFrame?.(readView(map));
    else if (e.key === 't' || e.key === 'T') live.current.onToggle3d?.();
    else if (TOOL_KEYS[e.key.toLowerCase()]) live.current.onSelectTool?.(TOOL_KEYS[e.key.toLowerCase()]!);
    else if (e.key === 'Escape') live.current.onCancelDraft?.();
    else if (e.key === 'Enter') live.current.onFinishDraft?.();
    else if (e.key === 'Backspace') live.current.onUndoPoint?.();
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
