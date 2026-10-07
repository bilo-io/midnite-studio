import { MAP_SOURCES, type MapProjectFile } from '@midnite/studio-shared';

import { MapCaptureSection } from './map-capture-section';
import { useMapSources } from './use-map';

/**
 * The detail pane (Phase 108 Theme A): where the map is now and which tile sources are usable. Capture,
 * the frame readout and tool options (Themes C–H) join it here.
 */
export function MapPanel({ map, project, repoId }: { map: MapProjectFile; project: string; repoId: string }) {
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
      <MapCaptureSection repoId={repoId} project={project} map={map} />
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
