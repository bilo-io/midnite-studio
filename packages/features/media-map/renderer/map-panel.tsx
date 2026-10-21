import { MAP_SOURCES, type MapProjectFile } from '@midnite/studio-shared';

import { MapCaptureSection } from './map-capture-section';
import { MapDrawingSection } from './map-drawing-section';
import type { MapDrawing } from './use-map-drawing';
import { formatMPerPx, formatSide } from './map-frame';
import { useMapSources } from './use-map';
import type { useMapFraming } from './use-map-framing';

type Framing = ReturnType<typeof useMapFraming>;

/** The 3D preview and frame readout (Theme C); the capture form itself is Theme D's `MapCaptureSection`. */
function FramingSection({ framing }: { framing: Framing }) {
  const { frame, visible, terrain3d, elevation } = framing;
  return (
    <section className="space-y-2" aria-label="3D and frame">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">3D and frame</h3>
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
          <dd className="min-w-0 break-words">{elevation ? `${Math.round(elevation.min)}–${Math.round(elevation.max)} m ≈ from preview tiles` : terrain3d.on ? '…' : 'Turn on 3D (T) to sample'}</dd>
        </dl>
      ) : (
        <p className="text-muted-foreground">Press F on the map to frame an area.</p>
      )}
    </section>
  );
}

/**
 * The detail pane (Phase 108 Theme A): where the map is now and which tile sources are usable. Capture,
 * the frame readout and tool options (Themes C–H) join it here.
 */
export function MapPanel({ map, project, repoId, framing, drawing }: { map: MapProjectFile; project: string; repoId: string; framing: Framing; drawing?: MapDrawing }) {
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
      {drawing ? <MapDrawingSection drawing={drawing} /> : null}
      <FramingSection framing={framing} />
      <MapCaptureSection repoId={repoId} project={project} map={map} frame={framing.visible ? framing.frame : null} onFrameChange={framing.setFrame} />
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
