import { MAP_SOURCES, TERRAIN_RESOLUTIONS, type MapProjectFile } from '@midnite/studio-shared';

import { formatMPerPx, formatSide } from './map-frame';
import { useMapSources } from './use-map';
import type { useMapFraming } from './use-map-framing';

type Framing = ReturnType<typeof useMapFraming>;

/** The capture form's first half (Theme C): 3D preview, the frame, its readout and warnings. Capture itself is Theme D. */
function CaptureSection({ framing }: { framing: Framing }) {
  const { frame, visible, terrain3d, elevation, warnings } = framing;
  const blocked = warnings.some((w) => w.blocking);
  return (
    <section className="space-y-2" aria-label="Capture for Terrain">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Capture for Terrain</h3>
      <label className="flex items-center justify-between gap-2">
        <span>3D exaggeration · {terrain3d.exaggeration.toFixed(1)}×</span>
        <input
          type="range"
          min={1}
          max={3}
          step={0.1}
          value={terrain3d.exaggeration}
          aria-label="3D exaggeration"
          onChange={(e) => framing.setTerrain3d({ ...terrain3d, exaggeration: Number(e.target.value) })}
        />
      </label>
      {frame && visible ? (
        <>
          <label className="flex items-center justify-between gap-2">
            <span>Output size</span>
            <select
              aria-label="Output size"
              className="rounded border border-border bg-background px-1 py-0.5 font-mono"
              value={frame.size}
              onChange={(e) => framing.setFrame({ ...frame, size: Number(e.target.value) as typeof frame.size })}
            >
              {TERRAIN_RESOLUTIONS.map((r) => (
                <option key={r} value={r}>
                  {r} × {r}
                </option>
              ))}
            </select>
          </label>
          <dl aria-live="polite" className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono tabular-nums" data-testid="frame-readout">
            <dt className="text-muted-foreground">Side</dt>
            <dd>{formatSide(frame.sideM)}</dd>
            <dt className="text-muted-foreground">Centre</dt>
            <dd>
              {frame.center[1].toFixed(5)}, {frame.center[0].toFixed(5)}
            </dd>
            <dt className="text-muted-foreground">Resolution</dt>
            <dd>{formatMPerPx(frame.sideM, frame.size)}</dd>
            <dt className="text-muted-foreground">Elevation</dt>
            <dd>{elevation ? `${Math.round(elevation.min)}–${Math.round(elevation.max)} m ≈ from preview tiles` : terrain3d.on ? '…' : 'Turn on 3D (T) to sample'}</dd>
          </dl>
          {warnings.length > 0 ? (
            <ul className="space-y-0.5 text-amber-600 dark:text-amber-400" aria-label="Capture warnings">
              {warnings.map((w) => (
                <li key={w.code}>{w.message}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className="text-muted-foreground">Press F on the map to frame an area.</p>
      )}
      <button
        type="button"
        disabled
        title={blocked ? 'Fix the warnings above first' : 'Capture arrives with Phase 108 Theme D'}
        className="w-full rounded-md border border-border px-2 py-1 text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
      >
        Capture
      </button>
    </section>
  );
}

/**
 * The detail pane (Phase 108 Theme A): where the map is now and which tile sources are usable. Capture,
 * the frame readout and tool options (Themes C–H) join it here.
 */
export function MapPanel({ map, project, framing }: { map: MapProjectFile; project: string; framing: Framing }) {
  const sources = useMapSources();
  const available = new Map((sources.data ?? []).map((s) => [s.id, s]));
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-3 text-xs" data-testid="map-panel">
      <section className="space-y-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">View · {project}</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono tabular-nums">
          <dt className="text-muted-foreground">Centre</dt>
          <dd>
            {map.view.center[1].toFixed(4)}, {map.view.center[0].toFixed(4)}
          </dd>
          <dt className="text-muted-foreground">Zoom</dt>
          <dd>{map.view.zoom.toFixed(2)}</dd>
          <dt className="text-muted-foreground">Bearing</dt>
          <dd>{Math.round(map.view.bearing)}°</dd>
          <dt className="text-muted-foreground">Pitch</dt>
          <dd>{Math.round(map.view.pitch)}°</dd>
        </dl>
      </section>
      <CaptureSection framing={framing} />
      <section className="space-y-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tile sources</h3>
        <ul className="space-y-1" aria-label="Tile sources">
          {MAP_SOURCES.map((source) => {
            const status = available.get(source.id);
            const ok = status ? status.available : !source.requiresKey;
            return (
              <li key={source.id} className="flex items-start gap-2">
                <span aria-hidden className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${ok ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                <span className="min-w-0">
                  <span className={ok ? 'text-foreground' : 'text-muted-foreground'}>{source.label}</span>
                  {!ok && status?.reason ? <span className="block text-[11px] text-muted-foreground">{status.reason}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
