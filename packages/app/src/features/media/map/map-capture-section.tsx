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
import { useState } from 'react';

import { useMapCapture } from './use-map-capture';

const DEM = mapSource('aws-terrarium');
const STAGE_LABEL = { plan: 'Planning', dem: 'Fetching elevation tiles', satellite: 'Satellite', roads: 'Roads', encode: 'Resampling and encoding', handoff: 'Finishing' } as const;

const formatSide = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`);

/**
 * Capture heightmap (Phase 108 Theme D): the frame's centre is the saved frame (Theme C) or the view
 * centre; the side and the output size are set here. Satellite, roads and the hand-off to Terrain join
 * this section in Themes E and F.
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
  const [localSide, setLocalSide] = useState(map.frame?.sideM ?? 5000);
  const [localSize, setLocalSize] = useState<number>(map.frame?.size ?? 1025);
  const center = frame?.center ?? map.frame?.center ?? map.view.center;
  const sideM = frame ? frame.sideM : localSide;
  const size: number = frame ? frame.size : localSize;
  const setSideM = (v: number) => (frame ? onFrameChange?.({ ...frame, sideM: Math.min(MAP_CAPTURE_MAX_SIDE_M, Math.max(MAP_CAPTURE_MIN_SIDE_M, v)) }) : setLocalSide(v));
  const setSize = (v: number) => (frame ? onFrameChange?.({ ...frame, size: v as MapFrame['size'] }) : setLocalSize(v));
  const warnings = captureWarnings({ sideM, center }, size, { nativeMPerPx: mapKernel.nativeMPerPx(DEM.maxZoom, center[1], DEM.tileSize) });
  const blocked = warnings.some((w) => w.blocking);
  const running = capture.state.phase === 'running';
  const z = mapKernel.chooseCaptureZoom(DEM, { center, sideM: Math.min(Math.max(sideM, MAP_CAPTURE_MIN_SIDE_M), MAP_CAPTURE_MAX_SIDE_M) }, size);

  return (
    <section className="space-y-2" aria-label="Capture heightmap" data-testid="map-capture">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Capture heightmap</h3>
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
      {warnings.map((w) => (
        <p key={w.code} role="status" className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-600 dark:text-amber-400">
          {w.message}
        </p>
      ))}
      {capture.state.phase === 'running' ? (
        <div className="space-y-1">
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
        <button
          type="button"
          disabled={blocked}
          title={blocked ? warnings.find((w) => w.blocking)?.message : 'Capture the elevation of this square'}
          className="w-full rounded bg-primary px-2 py-1 font-medium text-primary-foreground disabled:opacity-50"
          onClick={() => void capture.start({ repoId, project, center, sideM, size: size as (typeof TERRAIN_RESOLUTIONS)[number] })}
        >
          Capture heightmap
        </button>
      )}
      {capture.state.phase === 'failed' ? (
        <p role="alert" className="text-[11px] text-destructive">
          {capture.state.message}
        </p>
      ) : null}
      {capture.state.phase === 'done' ? (
        <div className="space-y-0.5 text-[11px]" data-testid="capture-done">
          <p className="font-medium">Captured to {capture.state.result.dir}</p>
          <p className="font-mono tabular-nums text-muted-foreground">
            {Math.round(capture.state.result.capture.heightMinM)} to {Math.round(capture.state.result.capture.heightMaxM)} m · {capture.state.result.capture.mPerPx.toFixed(1)} m/px · z{capture.state.result.capture.demZoom}
          </p>
        </div>
      ) : null}
    </section>
  );
}
