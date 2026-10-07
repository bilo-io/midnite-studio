import { activeSatelliteSource, MAP_BASEMAP_LABEL, MAP_BASEMAPS, MEDIA_TAB_EXPORT_FORMATS, type MapBasemap, type MapSourceStatus, type MapView } from '@midnite/studio-shared';
import { useCallback, useMemo, useState } from 'react';

import { EmptyState } from '../../../components/empty-state';
import { useUiStore } from '../../../store/ui-store';
import { ExportToolbar } from '../export-toolbar';
import { MediaLayout } from '../media-layout';
import type { MediaSelection } from '../media-projects-accordion';
import { NoRepoMediaState } from '../repo-media-tab';
import { useMediaProjects } from '../use-media';
import { LazyMapCanvas } from './map-canvas-lazy';
import { MapExplorer, mapProjectOf } from './map-explorer';
import { MapPanel } from './map-panel';
import { MapErrorChip, MapLoadingBar, MapLoadingState, MapOfflinePanel, isMapOffline } from './map-states';
import { basemapAttribution, buildMapStyle } from './map-style';
import { useBaseStyles, useMapProject, useMapSources, useSaveMapView } from './use-map';
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
  return (
    <MediaLayout
      tab="map"
      explorerName="maps"
      detailName="details"
      toolbar={<ExportToolbar formats={MEDIA_TAB_EXPORT_FORMATS.map} hasSelection={false} onExport={() => undefined} />}
      explorer={<MapExplorer repoId={repoId} selection={selection} onSelect={setSelection} />}
      content={<MapCentre key={`${repoId}/${project}`} repoId={repoId} project={project} />}
      detail={<MapDetail key={`${repoId}/${project}`} repoId={repoId} project={project} />}
    />
  );
}

function MapDetail({ repoId, project }: { repoId: string; project: string }) {
  const map = useMapProject(repoId, project);
  if (!map.data) return <EmptyState title="Nothing to show" body="The view and tile sources appear here." />;
  return <MapPanel map={map.data.map} project={project} />;
}

function MapCentre({ repoId, project }: { repoId: string; project: string }) {
  const map = useMapProject(repoId, project);
  const sources = useMapSources();
  const [reload, setReload] = useState(0);
  const base = useBaseStyles(reload);
  const status = useMapStatus();
  const { save } = useSaveMapView(repoId, project);
  const [basemapOverride, setBasemapOverride] = useState<MapBasemap | null>(null);
  const basemap = basemapOverride ?? map.data?.map.basemap ?? 'streets';
  const statuses = sources.data ?? NO_STATUSES;

  // Keyed on the satellite source, not the statuses array: a refetch must not rebuild (and re-apply) the style.
  const satellite = activeSatelliteSource(statuses);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `satellite` stands in for `statuses`
  const style = useMemo(() => (base.data ? buildMapStyle(basemap, { statuses, base: base.data }) : null), [base.data, basemap, satellite]);
  const onViewChange = useCallback((view: MapView) => save({ view }), [save]);
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
      <LazyMapCanvas style={style} view={map.data.map.view} onViewChange={onViewChange} attribution={basemapAttribution(basemap, statuses)} reloadKey={reload}>
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
        <div className="pointer-events-none absolute bottom-2 left-14 z-10">
          <MapErrorChip status={status} />
        </div>
      </LazyMapCanvas>
    </div>
  );
}
