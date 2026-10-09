import { BUILT_IN_FOLIAGE_DESIGNS, DEFAULT_FOLIAGE_ASSETS, MEDIA_ROOT_DIR, mstudioFileUrl, type TerrainRoadKeyResult, type TerrainSpec } from '@midnite/studio-shared';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { LuDices, LuPipette, LuRotateCcw } from 'react-icons/lu';

import { IconButton } from '../../../components/icon-button';
import { NumberField } from '../model/fields';
import type { TerrainRef } from './use-terrain';

/**
 * The Roads, Foliage and Buildings sections of the terrain panel (Phase 105 Themes G + H). Each commits
 * a spec patch through the panel's `commit`, which saves and re-bakes; the roads tolerance slider also
 * previews live through `media.terrain.roadKey` without a build.
 */
type Commit = (patch: Record<string, unknown>) => void;
type RoadKey = (req: { colour?: string; tolerance?: number; pick?: [number, number] }) => Promise<TerrainRoadKeyResult | null>;

/** The preview is debounced so a slider drag sends one request per pause, not one per pixel. */
export const ROAD_PREVIEW_DEBOUNCE_MS = 150;

/** Built-in foliage choices offered per class; aliases (`oak`, `grass-tuft`) are left out of the toggles. */
const FOLIAGE_CHOICES: Record<'tree' | 'grass', readonly string[]> = {
  tree: ['pine', 'broadleaf', 'birch', 'bush'],
  grass: ['grass-clump', 'bush', 'rock'],
};

function Section({ title, testId, children }: { title: string; testId: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-border pt-3" aria-label={title} data-testid={testId}>
      <span className="text-xs font-medium text-foreground">{title}</span>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function RoadsSection({
  repoId,
  terrainRef,
  spec,
  commit,
  roadKey,
}: {
  repoId: string;
  terrainRef: TerrainRef;
  spec: TerrainSpec;
  commit: Commit;
  roadKey: RoadKey;
}) {
  const roads = spec.roads;
  const [picking, setPicking] = useState(false);
  const [tolerance, setTolerance] = useState(roads.tolerance);
  const [preview, setPreview] = useState<TerrainRoadKeyResult | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = spec.inputs.roads;
  // Held in a ref so a parent re-render (a new `roadKey` identity) never re-sends the preview.
  const roadKeyRef = useRef(roadKey);
  roadKeyRef.current = roadKey;

  useEffect(() => setTolerance(roads.tolerance), [roads.tolerance]);
  // The first preview also tells the panel what auto-detection found.
  useEffect(() => {
    if (!input) return;
    let live = true;
    void roadKeyRef.current({ colour: roads.colour, tolerance: roads.tolerance }).then((next) => {
      if (live && next) setPreview(next);
    });
    return () => {
      live = false;
    };
  }, [roads.colour, roads.tolerance, input, spec.updatedAt]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (!input) return null;
  const source = `${mstudioFileUrl('repo', repoId, `${MEDIA_ROOT_DIR}/terrain/${terrainRef.project}/${terrainRef.terrain}/${input.file}`)}?v=${encodeURIComponent(spec.updatedAt ?? '')}`;
  const swatch = roads.colour ?? preview?.detected ?? null;

  const schedulePreview = (next: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void roadKeyRef.current({ colour: roads.colour, tolerance: next }).then((res) => {
        if (res) setPreview(res);
      });
    }, ROAD_PREVIEW_DEBOUNCE_MS);
  };
  const commitTolerance = () => {
    if (tolerance !== roads.tolerance) commit({ roads: { ...roads, tolerance } });
  };
  const pick = async (event: MouseEvent<HTMLImageElement>) => {
    if (!picking) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const clamp = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
    const uv: [number, number] = [clamp((event.clientX - rect.left) / (rect.width || 1)), clamp((event.clientY - rect.top) / (rect.height || 1))];
    setPicking(false);
    const res = await roadKeyRef.current({ pick: uv, tolerance });
    if (!res?.colour) return;
    setPreview(res);
    commit({ roads: { ...roads, colour: res.colour } });
  };

  return (
    <Section title="Roads" testId="terrain-roads-section">
      <Row label="Road colour">
        <span
          aria-hidden
          data-testid="road-colour-swatch"
          className="h-4 w-4 shrink-0 rounded border border-border"
          style={{ background: swatch ?? 'transparent' }}
        />
        <span className="truncate font-mono text-[11px] text-foreground">
          {roads.colour ? roads.colour : swatch ? `Auto · ${swatch}` : 'Auto · brightness'}
        </span>
        <IconButton
          icon={LuPipette}
          label={picking ? 'Cancel colour pick' : 'Pick the road colour from the image'}
          size="sm"
          aria-pressed={picking}
          onClick={() => setPicking((v) => !v)}
        />
        {roads.colour ? (
          <IconButton icon={LuRotateCcw} label="Detect the road colour automatically" size="sm" onClick={() => commit({ roads: { ...roads, colour: undefined } })} />
        ) : null}
      </Row>
      <div className="grid grid-cols-2 gap-1.5">
        <figure className="flex flex-col gap-0.5">
          <img
            src={source}
            alt="Roads image"
            draggable={false}
            onClick={(event) => void pick(event)}
            className={`aspect-square w-full rounded border object-cover ${picking ? 'cursor-crosshair border-primary' : 'border-border'}`}
          />
          <figcaption className="text-[10px] text-muted-foreground">{picking ? 'Click a road' : 'Source'}</figcaption>
        </figure>
        <figure className="flex flex-col gap-0.5">
          {preview ? (
            <img
              src={`data:image/png;base64,${preview.pngBase64}`}
              alt="Road mask preview"
              className="aspect-square w-full rounded border border-border bg-black object-cover [image-rendering:pixelated]"
            />
          ) : (
            <div className="aspect-square w-full rounded border border-dashed border-border" />
          )}
          <figcaption className="text-[10px] text-muted-foreground">Mask</figcaption>
        </figure>
      </div>
      <Row label="Tolerance">
        <input
          type="range"
          aria-label="Road colour tolerance"
          min={0}
          max={1}
          step={0.01}
          value={tolerance}
          onChange={(event) => {
            const next = Number(event.target.value);
            setTolerance(next);
            schedulePreview(next);
          }}
          onPointerUp={commitTolerance}
          onKeyUp={commitTolerance}
          onBlur={commitTolerance}
          className="h-1.5 min-w-0 flex-1 cursor-pointer accent-primary"
        />
        <span className="w-8 text-right font-mono text-[11px] text-muted-foreground">{tolerance.toFixed(2)}</span>
      </Row>
      <Row label="Width scale">
        <NumberField
          label="Road width scale"
          value={roads.widthScale}
          step={0.05}
          min={0.25}
          max={4}
          onCommit={(widthScale) => widthScale !== undefined && commit({ roads: { ...roads, widthScale } })}
        />
        <span className="text-[11px] text-muted-foreground">×</span>
      </Row>
    </Section>
  );
}

export function FoliageSection({ spec, commit }: { spec: TerrainSpec; commit: Commit }) {
  const foliage = spec.foliage;
  const assetsFor = (cls: 'tree' | 'grass') => foliage.assets?.[cls] ?? DEFAULT_FOLIAGE_ASSETS[cls];
  const toggle = (cls: 'tree' | 'grass', asset: string) => {
    const current = assetsFor(cls);
    const next = current.includes(asset) ? current.filter((a) => a !== asset) : [...current, asset];
    // A class always keeps at least one asset; an empty list would silently scatter nothing.
    if (next.length === 0) return;
    commit({ foliage: { ...foliage, assets: { ...DEFAULT_FOLIAGE_ASSETS, ...foliage.assets, [cls]: next } } });
  };
  const set = (patch: Partial<TerrainSpec['foliage']>) => commit({ foliage: { ...foliage, ...patch } });

  return (
    <Section title="Foliage" testId="terrain-foliage-section">
      <Row label="Trees">
        <NumberField label="Tree density" value={foliage.treeDensity} step={0.5} min={0} max={50} onCommit={(v) => v !== undefined && set({ treeDensity: v })} />
        <span className="text-[11px] text-muted-foreground">/ 100 m²</span>
      </Row>
      <Row label="Grass">
        <NumberField label="Grass density" value={foliage.grassDensity} step={1} min={0} max={200} onCommit={(v) => v !== undefined && set({ grassDensity: v })} />
        <span className="text-[11px] text-muted-foreground">/ 100 m²</span>
      </Row>
      <Row label="Slope limit">
        <NumberField label="Foliage slope limit" value={foliage.slopeLimitDeg} step={1} min={0} max={90} onCommit={(v) => v !== undefined && set({ slopeLimitDeg: v })} />
        <span className="text-[11px] text-muted-foreground">°</span>
      </Row>
      <Row label="Seed">
        <NumberField label="Foliage seed" value={foliage.seed} step={1} min={0} integer onCommit={(v) => v !== undefined && set({ seed: v })} />
        <IconButton icon={LuDices} label="Re-roll foliage seed" size="sm" onClick={() => set({ seed: Math.floor(Math.random() * 2 ** 31) })} />
      </Row>
      {(['tree', 'grass'] as const).map((cls) => (
        <div key={cls} className="flex flex-wrap items-center gap-1" role="group" aria-label={`${cls === 'tree' ? 'Tree' : 'Grass'} assets`}>
          <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{cls === 'tree' ? 'Tree assets' : 'Grass assets'}</span>
          {FOLIAGE_CHOICES[cls]
            .filter((asset) => asset in BUILT_IN_FOLIAGE_DESIGNS)
            .map((asset) => {
              const on = assetsFor(cls).includes(asset);
              return (
                <button
                  key={asset}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(cls, asset)}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${on ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:bg-primary/10'}`}
                >
                  {asset}
                </button>
              );
            })}
        </div>
      ))}
    </Section>
  );
}

export function BuildingsSection({ spec, commit }: { spec: TerrainSpec; commit: Commit }) {
  const buildings = spec.buildings;
  const [lo, hi] = buildings.height;
  const set = (patch: Partial<TerrainSpec['buildings']>) => commit({ buildings: { ...buildings, ...patch } });
  return (
    <Section title="Buildings" testId="terrain-buildings-section">
      <Row label="Height">
        <NumberField label="Building height minimum" value={lo} step={1} min={1} onCommit={(v) => v !== undefined && v <= hi && set({ height: [v, hi] })} />
        <NumberField label="Building height maximum" value={hi} step={1} min={1} onCommit={(v) => v !== undefined && v >= lo && set({ height: [lo, v] })} />
        <span className="text-[11px] text-muted-foreground">m</span>
      </Row>
      <Row label="Min area">
        <NumberField label="Building minimum area" value={buildings.minAreaM2} step={5} min={1} onCommit={(v) => v !== undefined && set({ minAreaM2: v })} />
        <span className="text-[11px] text-muted-foreground">m²</span>
      </Row>
      <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
        <input type="checkbox" checked={buildings.scaleByArea} onChange={(e) => set({ scaleByArea: e.target.checked })} className="h-3.5 w-3.5 rounded border-border" />
        Taller buildings on larger footprints
      </label>
    </Section>
  );
}
