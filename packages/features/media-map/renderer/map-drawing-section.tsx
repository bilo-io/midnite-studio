import { map as geo } from '@midnite/studio-shared';

import { circlePair, draftReadout, featureFacts } from './map-layers';
import { circleFeature, MAP_TOOL_LABEL } from './map-tools';
import type { MapDrawing } from './use-map-drawing';

const HINT: Record<string, string> = {
  distance: 'Click to add points. Enter or double-click finishes; Esc cancels; drag a vertex to adjust.',
  circle: 'Click the centre, then click again to set the radius (Enter keeps 1 km).',
  area: 'Click three or more corners. Enter or double-click finishes.',
  pin: 'Click to drop a pin.',
};

const field = 'w-full rounded-md border border-border bg-background px-2 py-1 text-xs';

/** Measure readout and the selected feature's editor (Phase 108 Themes G and H), in the detail pane. */
export function MapDrawingSection({ drawing }: { drawing: MapDrawing }) {
  const { state, units, selectedFeatures, layers } = drawing;
  const readout = draftReadout(state, units);
  const one = selectedFeatures.length === 1 ? selectedFeatures[0]! : null;
  const pair = selectedFeatures.length === 2 ? circlePair(selectedFeatures[0]!.feature, selectedFeatures[1]!.feature, units) : null;
  const min = geo.MIN_CIRCLE_RADIUS_M;
  const max = geo.MAX_CIRCLE_RADIUS_M;

  const update = (patch: (f: NonNullable<typeof one>['feature']) => NonNullable<typeof one>['feature']) => one && layers.updateFeature(one.layer, one.id, patch);

  return (
    <section className="space-y-2" aria-label="Measure and draw" data-testid="map-drawing-section">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Measure and draw</h3>
      {state.tool === 'pan' ? (
        <p className="text-muted-foreground">Pick a tool: Distance (D), Radius circle (C), Area (A) or Pin (P).</p>
      ) : (
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">{MAP_TOOL_LABEL[state.tool]}.</span> {HINT[state.tool]}
        </p>
      )}
      <div aria-live="polite" className="space-y-1">
        {readout ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono tabular-nums" data-testid="measure-readout">
            {readout.rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {drawing.notice ? <p className="text-destructive">{drawing.notice}</p> : null}
      </div>

      {pair ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono tabular-nums" data-testid="circle-pair">
          {pair.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k === 'Centre to centre' ? 'Centre to centre:' : `${k}:`}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {one ? (
        <div className="space-y-1.5 border-t border-border pt-2" data-testid="feature-editor">
          <p className="text-[11px] font-medium text-muted-foreground">
            {one.feature.properties.kind} in {one.layer}
          </p>
          <label className="block space-y-0.5">
            <span className="text-muted-foreground">Label</span>
            <input className={field} aria-label="Label" value={one.feature.properties.label ?? ''} onChange={(e) => update((f) => ({ ...f, properties: { ...f.properties, label: e.target.value } }))} />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Colour</span>
            <input type="color" aria-label="Colour" value={one.feature.properties.color ?? layers.layers.find((l) => l.name === one.layer)?.color ?? '#3b82f6'} onChange={(e) => update((f) => ({ ...f, properties: { ...f.properties, color: e.target.value } }))} />
          </label>
          {one.feature.properties.kind === 'circle' ? (
            <label className="block space-y-0.5">
              <span className="text-muted-foreground">Radius (m)</span>
              <input
                className={field}
                type="number"
                aria-label="Radius (m)"
                min={min}
                max={max}
                value={Math.round(one.feature.properties.radiusM ?? 0)}
                onChange={(e) => {
                  const r = Number(e.target.value);
                  if (!Number.isFinite(r) || r < min || r > max) return;
                  update((f) => {
                    const c = f.properties.center;
                    return c ? circleFeature(f.id ?? one.id, c as [number, number], r, f.properties.label, f.properties.color) : f;
                  });
                }}
              />
            </label>
          ) : null}
          {one.feature.properties.kind === 'pin' ? (
            <label className="block space-y-0.5">
              <span className="text-muted-foreground">Note</span>
              <textarea className={`${field} min-h-14`} aria-label="Note" value={one.feature.properties.note ?? ''} onChange={(e) => update((f) => ({ ...f, properties: { ...f.properties, note: e.target.value } }))} />
            </label>
          ) : null}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono tabular-nums">
            {featureFacts(one.feature, units).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <button
            type="button"
            onClick={() => {
              layers.removeFeature(one.layer, one.id);
              drawing.clearSelection();
            }}
            className="rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-destructive"
          >
            Delete {one.feature.properties.kind}
          </button>
        </div>
      ) : null}
    </section>
  );
}
