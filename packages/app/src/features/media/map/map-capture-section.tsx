import {
  MAP_CAPTURE_MAX_SIDE_M,
  MAP_CAPTURE_MIN_SIDE_M,
  TERRAIN_RESOLUTIONS,
  captureWarnings,
  map as mapKernel,
  mapSource,
  type MapFrame,
  type MapProjectFile,
} from '@midnite/studio-shared';
import { useMemo, useState } from 'react';

import { ExportLayersList, getExportLayerStatus, type MapLayerExportDef, type MapLayerExportId } from './map-capture-layers';
import { useMapPlaceStore } from './map-place-store';
import { useMapCapture } from './use-map-capture';

const DEM = mapSource('aws-terrarium');
const STAGE_LABEL = { plan: 'Planning', dem: 'Fetching elevation tiles', satellite: 'Satellite', roads: 'Roads', buildings: 'Buildings', encode: 'Resampling and encoding', handoff: 'Finishing' } as const;

const formatSide = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`);

/**
 * Capture heightmap (Phase 108 Theme D): the frame's centre is the saved frame (Theme C) or the view
 * centre; the side and the output size are set here. Theme E adds the satellite and roads layers
 * (on by default; roads are skipped above 25 km), Buildings likewise (above 10 km), Theme F the hand-off to Terrain.
 */
export function MapCaptureSection({
  repoId,
  project,
  map,
  frame = null,
  onFrameChange,
}: {
  repoId: string;
  project: string;
  map: MapProjectFile;
  /** Theme C's on-map frame, when shown: it then owns the centre, side and size. */
  frame?: MapFrame | null;
  onFrameChange?: (frame: MapFrame) => void;
}) {
  const capture = useMapCapture();
  const [satellite, setSatellite] = useState(true);
  const [roads, setRoads] = useState(true);
  const [buildings, setBuildings] = useState(true);
  const [activeLayers, setActiveLayers] = useState<MapLayerExportDef[] | null>(null);
  const [localSide, setLocalSide] = useState(map.frame?.sideM ?? 5000);
  const [localSize, setLocalSize] = useState<number>(map.frame?.size ?? 1025);
  const center = frame?.center ?? map.frame?.center ?? map.view.center;
  const sideM = frame ? frame.sideM : localSide;
  const size: number = frame ? frame.size : localSize;
  const setSideM = (v: number) => (frame ? onFrameChange?.({ ...frame, sideM: Math.min(MAP_CAPTURE_MAX_SIDE_M, Math.max(MAP_CAPTURE_MIN_SIDE_M, v)) }) : setLocalSide(v));
  const setSize = (v: number) => (frame ? onFrameChange?.({ ...frame, size: v as MapFrame['size'] }) : setLocalSize(v));
  const warnings = captureWarnings({ sideM, center }, size, { nativeMPerPx: mapKernel.nativeMPerPx(DEM.maxZoom, center[1], DEM.tileSize) }).filter((w) => (roads || w.code !== 'roads-skipped') && (buildings || w.code !== 'buildings-skipped'));
  const roadsSkipped = warnings.some((w) => w.code === 'roads-skipped');
  const buildingsSkipped = warnings.some((w) => w.code === 'buildings-skipped');
  const blocked = warnings.some((w) => w.blocking);
  const running = capture.state.phase === 'running';
  // The last searched place names the capture, but only while the frame is still near it.
  const lastPlace = useMapPlaceStore((st) => st.place);
  const place = lastPlace && mapKernel.inverse(lastPlace.center, center).distanceM <= Math.max(sideM, 5000) ? lastPlace.name.slice(0, 80) : undefined;
  const start = (extra: { handoff?: boolean; build?: boolean }) => {
    const list: MapLayerExportDef[] = [{ id: 'dem', label: 'Heightmap (Elevation DEM)' }];
    if (satellite) list.push({ id: 'satellite', label: 'Satellite image' });
    if (roads && !roadsSkipped) list.push({ id: 'roads', label: 'Roads (OpenStreetMap)' });
    if (buildings && !buildingsSkipped) list.push({ id: 'buildings', label: 'Buildings (OpenStreetMap)' });
    setActiveLayers(list);
    void capture.start({ repoId, project, center, sideM, size: size as (typeof TERRAIN_RESOLUTIONS)[number], satellite, roads, buildings, ...(place ? { place } : {}), ...extra });
  };

  const exportLayers = useMemo((): MapLayerExportDef[] => {
    if (activeLayers) return activeLayers;
    if (capture.state.phase === 'done') {
      const list: MapLayerExportDef[] = [{ id: 'dem', label: 'Heightmap (Elevation DEM)' }];
      const cap = capture.state.result.capture;
      if (cap.sources.satellite || cap.missing.some((m) => m.slot === 'satellite')) {
        list.push({ id: 'satellite', label: 'Satellite image' });
      }
      if (cap.sources.roads || cap.missing.some((m) => m.slot === 'roads')) {
        list.push({ id: 'roads', label: 'Roads (OpenStreetMap)' });
      }
      if (cap.sources.buildings || cap.missing.some((m) => m.slot === 'buildings')) {
        list.push({ id: 'buildings', label: 'Buildings (OpenStreetMap)' });
      }
      return list;
    }
    const list: MapLayerExportDef[] = [{ id: 'dem', label: 'Heightmap (Elevation DEM)' }];
    if (satellite) list.push({ id: 'satellite', label: 'Satellite image' });
    if (roads && !roadsSkipped) list.push({ id: 'roads', label: 'Roads (OpenStreetMap)' });
    if (buildings && !buildingsSkipped) list.push({ id: 'buildings', label: 'Buildings (OpenStreetMap)' });
    return list;
  }, [activeLayers, capture.state, satellite, roads, buildings, roadsSkipped, buildingsSkipped]);

  const getLayerStatus = (layerId: MapLayerExportId) =>
    getExportLayerStatus({
      layerId,
      phase: capture.state.phase,
      currentStage: capture.state.phase === 'running' ? capture.state.stage : undefined,
      failedStage: capture.state.phase === 'failed' ? capture.state.stage : undefined,
      missingSlots: capture.state.phase === 'done' ? capture.state.result.capture.missing.map((m) => m.slot) : undefined,
    });
  const z = mapKernel.chooseCaptureZoom(DEM, { center, sideM: Math.min(Math.max(sideM, MAP_CAPTURE_MIN_SIDE_M), MAP_CAPTURE_MAX_SIDE_M) }, size);

  return (
    <section className="space-y-2" aria-label="Capture for Terrain" data-testid="map-capture">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Capture for Terrain</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono tabular-nums">
        <dt className="text-muted-foreground">Centre</dt>
        <dd>
          {center[1].toFixed(5)}, {center[0].toFixed(5)}
        </dd>
        <dt className="text-muted-foreground">Metres/px</dt>
        <dd data-testid="capture-mpp">{(sideM / (size - 1)).toFixed(2)}</dd>
        <dt className="text-muted-foreground">Elevation zoom</dt>
        <dd data-testid="capture-zoom">
          z{z.z} · {z.count} tiles
        </dd>
      </dl>
      <label className="flex items-center justify-between gap-2">
        <span>Side (m)</span>
        <input
          type="number"
          aria-label="Capture side in metres"
          className="w-24 rounded border border-border bg-background px-1.5 py-0.5 text-right font-mono"
          min={MAP_CAPTURE_MIN_SIDE_M}
          max={MAP_CAPTURE_MAX_SIDE_M}
          value={sideM}
          disabled={running}
          onChange={(e) => setSideM(Number(e.target.value) || MAP_CAPTURE_MIN_SIDE_M)}
        />
      </label>
      <p className="text-right text-[11px] text-muted-foreground">{formatSide(sideM)} square</p>
      <label className="flex items-center justify-between gap-2">
        <span>Output size</span>
        <select
          aria-label="Capture output size"
          className="rounded border border-border bg-background px-1.5 py-0.5 font-mono"
          value={size}
          disabled={running}
          onChange={(e) => setSize(Number(e.target.value))}
        >
          {TERRAIN_RESOLUTIONS.map((n) => (
            <option key={n} value={n}>
              {n} × {n}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="space-y-0.5" disabled={running}>
        <legend className="sr-only">Layers to capture</legend>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={satellite} onChange={(e) => setSatellite(e.target.checked)} />
          <span>Satellite image</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={roads} onChange={(e) => setRoads(e.target.checked)} />
          <span>Roads (OpenStreetMap)</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={buildings} onChange={(e) => setBuildings(e.target.checked)} />
          <span>Buildings (OpenStreetMap)</span>
        </label>
      </fieldset>
      {warnings.map((w) => (
        <p key={w.code} role="status" className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-600 dark:text-amber-400">
          {w.message}
        </p>
      ))}
      {capture.state.phase === 'running' ? (
        <div className="space-y-2">
          <ExportLayersList layers={exportLayers} getStatus={getLayerStatus} />
          <div role="progressbar" aria-label="Capture progress" aria-valuenow={Math.round(capture.state.fraction * 100)} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded bg-muted">
            <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(capture.state.fraction * 100)}%` }} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">{STAGE_LABEL[capture.state.stage]}…</span>
            <button type="button" className="rounded border border-border px-2 py-0.5 hover:bg-accent" onClick={() => void capture.cancel()}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <button
            type="button"
            disabled={blocked}
            title={blocked ? warnings.find((w) => w.blocking)?.message : 'Capture this square, make a terrain from it and build it'}
            className="w-full rounded bg-primary px-2 py-1 font-medium text-primary-foreground disabled:opacity-50"
            onClick={() => start({ handoff: true, build: true })}
          >
            Capture and build
          </button>
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              disabled={blocked}
              title="Capture and make a terrain, without building it"
              className="rounded border border-border px-2 py-1 hover:bg-accent disabled:opacity-50"
              onClick={() => start({ handoff: true })}
            >
              Capture only
            </button>
            <button
              type="button"
              disabled={blocked}
              title="Write the heightmap files only; no terrain is made"
              className="rounded border border-border px-2 py-1 hover:bg-accent disabled:opacity-50"
              onClick={() => start({})}
            >
              Capture heightmap
            </button>
          </div>
        </div>
      )}
      {capture.state.phase === 'failed' ? (
        <div className="space-y-2">
          <ExportLayersList layers={exportLayers} getStatus={getLayerStatus} />
          <p role="alert" className="text-[11px] text-destructive">
            {capture.state.message}
          </p>
        </div>
      ) : null}
      {capture.state.phase === 'done' ? (
        <div className="space-y-2 text-[11px]" data-testid="capture-done">
          <ExportLayersList layers={exportLayers} getStatus={getLayerStatus} />
          <p className="font-medium">Captured to {capture.state.result.dir}</p>
          <p className="font-mono tabular-nums text-muted-foreground">
            {Math.round(capture.state.result.capture.heightMinM)} to {Math.round(capture.state.result.capture.heightMaxM)} m · {capture.state.result.capture.mPerPx.toFixed(1)} m/px · z{capture.state.result.capture.demZoom}
          </p>
          {capture.state.result.terrain ? <p data-testid="capture-terrain">Opened terrain {capture.state.result.terrain.terrain} in the Terrain tab.</p> : null}
          {capture.state.result.capture.missing.length > 0 ? (
            <div className="text-muted-foreground" data-testid="capture-missing">
              <p>
                Captured with {capture.state.result.capture.missing.length} missing: {capture.state.result.capture.missing.map((m) => m.slot).join(', ')}
              </p>
              <ul className="list-disc pl-4">
                {capture.state.result.capture.missing.map((m) => (
                  <li key={m.slot}>
                    {m.slot}: {m.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
