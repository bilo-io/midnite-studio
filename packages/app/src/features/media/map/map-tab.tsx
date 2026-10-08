import { activeSatelliteSource, MAP_BASEMAP_LABEL, MAP_BASEMAPS, MEDIA_TAB_EXPORT_FORMATS, type MapBasemap, type MapProjectPatch, type MapSourceStatus, type MapView } from '@midnite/studio-shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { MapToolbar } from './map-toolbar';
import { MapPlaceSearch } from './map-place-search';
import { downloadLayer } from './map-layer-export';
import { useMapDrawing, type MapDrawing } from './use-map-drawing';

import { EmptyState } from '../../../components/empty-state';
import { bridge } from '../../../services/bridge';
import { useUiStore } from '../../../store/ui-store';
import { ExportToolbar } from '../export-toolbar';
import { MediaLayout } from '../media-layout';
import type { MediaSelection } from '../media-projects-accordion';
import { NoRepoMediaState } from '../repo-media-tab';
import { useMediaProjects } from '../use-media';
import { Tooltip } from '../../../components/tooltip';
import type { MapCanvasHandle } from './map-canvas';
import { LazyMapCanvas } from './map-canvas-lazy';
import { useMapFocus, zoomForSide } from './map-focus';
import { MapExplorer, mapProjectOf } from './map-explorer';
import { MapPanel } from './map-panel';
import { MapErrorChip, MapLoadingBar, MapLoadingState, MapOfflinePanel, isMapOffline } from './map-states';
import { basemapAttribution, buildMapStyle } from './map-style';
import { useMapFraming } from './use-map-framing';
import { mapKey, useBaseStyles, useMapProject, useMapSources, useSaveMapView } from './use-map';
import { useMapStatus } from './use-map-status';

const NO_STATUSES: readonly MapSourceStatus[] = [];

/**
 * Media ▸ Maps (Phase 108 Theme A): projects and layers on the left, the MapLibre canvas in the middle,
 * the view readout and tile sources on the right. A project is a folder under `.midnite/media/map/`;
 * the last viewport is saved to its `map.json` 750 ms after the map settles, and once more on unmount.
 */
export function MapTab() {
  const repoId = useUiStore((s) => s.selectedRepoId);
  if (!repoId) return <NoRepoMediaState tab="map" />;
  return <MapTabBody repoId={repoId} />;
}

function MapTabBody({ repoId }: { repoId: string }) {
  const [selection, setSelection] = useState<MediaSelection | null>(null);
  const projects = useMediaProjects(repoId, 'map');
  const project = mapProjectOf(selection, projects.data);
  // Bumped by "Show on map": remounts the workspace so it re-reads the framed `map.json`.
  const [focusN, setFocusN] = useState(0);
  const focus = useMapFocus((s) => s.request);
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!focus) return;
    useMapFocus.getState().clear();
    void (async () => {
      const view = { center: focus.center, zoom: zoomForSide(focus.center[1], focus.sideM), bearing: 0, pitch: 0 };
      await bridge()?.media.map.setView({ repoId, project: focus.project, patch: { view } });
      await queryClient.invalidateQueries({ queryKey: mapKey(repoId, focus.project) });
      setSelection({ project: focus.project, path: null });
      setFocusN((n) => n + 1);
    })();
  }, [focus, repoId, queryClient]);
  // `map_goto` (Phase 108 Theme I): main has already saved the view to the project's `map.json`, so
  // refetching and remounting the workspace is all it takes to land there.
  useEffect(
    () =>
      bridge()?.media.map.onOpen((event) => {
        if (event.repoId !== repoId) return;
        void (async () => {
          await queryClient.invalidateQueries({ queryKey: mapKey(repoId, event.project) });
          setSelection({ project: event.project, path: null });
          setFocusN((n) => n + 1);
        })();
      }),
    [repoId, queryClient],
  );
  return <MapWorkspace key={`${repoId}/${project}/${focusN}`} repoId={repoId} project={project} selection={selection} setSelection={setSelection} />;
}

type Framing = ReturnType<typeof useMapFraming>;

function MapWorkspace({ repoId, project, selection, setSelection }: { repoId: string; project: string; selection: MediaSelection | null; setSelection: (s: MediaSelection | null) => void }) {
  const map = useMapProject(repoId, project);
  const { save } = useSaveMapView(repoId, project);
  const framing = useMapFraming({ map: map.data?.map, save });
  const drawing = useMapDrawing({ repoId, project, map: map.data?.map, save });
  const layer = drawing.layers.layers.find((l) => l.name === drawing.layers.active && l.fc);
  return (
    <MediaLayout
      tab="map"
      explorerName="maps"
      detailName="details"
      toolbar={<ExportToolbar formats={MEDIA_TAB_EXPORT_FORMATS.map} hasSelection={Boolean(layer)} onExport={(format) => layer?.fc && downloadLayer(layer.name, layer.fc, format)} />}
      explorer={<MapExplorer repoId={repoId} selection={selection} onSelect={setSelection} layers={drawing.layers} />}
      content={<MapCentre repoId={repoId} project={project} save={save} framing={framing} drawing={drawing} />}
      detail={<MapDetail repoId={repoId} project={project} framing={framing} drawing={drawing} />}
    />
  );
}

function MapDetail({ repoId, project, framing, drawing }: { repoId: string; project: string; framing: Framing; drawing: MapDrawing }) {
  const map = useMapProject(repoId, project);
  if (!map.data) return <EmptyState title="Nothing to show" body="The view and tile sources appear here." />;
  return <MapPanel map={map.data.map} project={project} repoId={repoId} framing={framing} drawing={drawing} />;
}

function MapCentre({ repoId, project, save, framing, drawing }: { repoId: string; project: string; save: (patch: MapProjectPatch) => void; framing: Framing; drawing: MapDrawing }) {
  const map = useMapProject(repoId, project);
  const sources = useMapSources();
  const [reload, setReload] = useState(0);
  const base = useBaseStyles(reload);
  const status = useMapStatus();
  const handle = useRef<MapCanvasHandle>(null);
  const viewRef = useRef<MapView | null>(null);
  const [basemapOverride, setBasemapOverride] = useState<MapBasemap | null>(null);
  const basemap = basemapOverride ?? map.data?.map.basemap ?? 'streets';
  const statuses = sources.data ?? NO_STATUSES;

  // Keyed on the satellite source, not the statuses array: a refetch must not rebuild (and re-apply) the style.
  const satellite = activeSatelliteSource(statuses);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `satellite` stands in for `statuses`
  const style = useMemo(() => (base.data ? buildMapStyle(basemap, { statuses, base: base.data }) : null), [base.data, basemap, satellite]);
  const onViewChange = useCallback(
    (view: MapView) => {
      viewRef.current = view;
      save({ view });
    },
    [save],
  );
  const toggleFrame = () => map.data && framing.toggleFrame(viewRef.current ?? map.data.map.view);
  const pick = (next: MapBasemap) => {
    setBasemapOverride(next);
    save({ basemap: next });
  };
  const retry = () => setReload((n) => n + 1);

  if (map.isError) return <EmptyState title="Could not read this map" body={map.error.message} />;
  if (base.isError || !status.online) return <MapOfflinePanel onRetry={() => (base.isError ? void base.refetch() : retry())} />;
  if (!map.data || !style) return <MapLoadingState />;
  if (isMapOffline(status)) return <MapOfflinePanel onRetry={retry} />;

  return (
    <div className="relative h-full min-h-0" data-testid="map-view">
      <LazyMapCanvas style={style} view={map.data.map.view} onViewChange={onViewChange} attribution={basemapAttribution(basemap, statuses)}
        reloadKey={reload}
        terrain3d={framing.terrain3d}
        frame={framing.visible ? framing.frame : null}
        onFrameChange={framing.moveFrame}
        onElevation={framing.setElevation}
        onToggleFrame={toggleFrame}
        onToggle3d={framing.toggle3d}
        handleRef={handle}
        tool={drawing.tool}
        drawings={drawing.drawings}
        draft={drawing.draft}
        onMapClick={drawing.click}
        onMapDoubleClick={drawing.finish}
        onVertexMove={drawing.moveVertex}
        onFeatureClick={drawing.pickFeature}
        onSelectTool={drawing.selectTool}
        onCancelDraft={drawing.cancel}
        onFinishDraft={drawing.finish}
        onUndoPoint={drawing.undo}
      >
        <MapToolbar tool={drawing.tool} onSelect={drawing.selectTool} />
        <div className="absolute left-1/2 top-2 z-10 -translate-x-1/2">
          <MapPlaceSearch onPick={(center, zoom) => handle.current?.flyTo(center, zoom)} />
        </div>
        <MapLoadingBar status={status} />
        <div role="group" aria-label="Basemap" className="absolute right-12 top-2 z-10 flex overflow-hidden rounded-md border border-border bg-background/80 text-xs shadow-sm backdrop-blur-sm">
          {MAP_BASEMAPS.map((b) => (
            <button
              key={b}
              type="button"
              aria-pressed={b === basemap}
              onClick={() => pick(b)}
              className={`px-2 py-1 ${b === basemap ? 'bg-primary/15 font-medium text-primary' : 'text-muted-foreground hover:bg-accent'}`}
            >
              {MAP_BASEMAP_LABEL[b]}
            </button>
          ))}
        </div>
        <div role="group" aria-label="View" className="absolute left-12 top-2 z-10 flex overflow-hidden rounded-md border border-border bg-background/80 text-xs shadow-sm backdrop-blur-sm">
          <Tooltip label="Toggle 3D (T)">
            <button type="button" aria-label="Toggle 3D (T)" aria-pressed={framing.terrain3d.on} onClick={framing.toggle3d} className={`px-2 py-1 ${framing.terrain3d.on ? 'bg-primary/15 font-medium text-primary' : 'text-muted-foreground hover:bg-accent'}`}>
              3D
            </button>
          </Tooltip>
          <Tooltip label="Toggle capture frame (F)">
            <button type="button" aria-label="Toggle capture frame (F)" aria-pressed={framing.visible} onClick={toggleFrame} className={`px-2 py-1 ${framing.visible ? 'bg-primary/15 font-medium text-primary' : 'text-muted-foreground hover:bg-accent'}`}>
              Frame
            </button>
          </Tooltip>
          <Tooltip label="Reset north">
            <button type="button" aria-label="Reset north" onClick={() => handle.current?.resetNorth()} className="px-2 py-1 text-muted-foreground hover:bg-accent">
              N
            </button>
          </Tooltip>
        </div>
        <div className="pointer-events-none absolute bottom-2 left-14 z-10">
          <MapErrorChip status={status} />
        </div>
      </LazyMapCanvas>
    </div>
  );
}
