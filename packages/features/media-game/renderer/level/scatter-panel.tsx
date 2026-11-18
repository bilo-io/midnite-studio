import { useState } from 'react';
import { LuDices, LuX } from 'react-icons/lu';
import type { GamePrefabListEntry, ScatterSource } from '@midnite/studio-shared';

import { BrandSlider } from '@midnite/studio-frame';

import { IconButton } from '../chrome';
import { isAssetDrag, readDroppedAsset, type AssetDragPayload } from './assets/asset-drag';
import { newSeed, type ScatterSettings } from './level-scatter';

/** The source a browser tile becomes: a model asset or a prefab; any other asset kind is not scatterable. */
export function sourceFromPayload(payload: AssetDragPayload): ScatterSource | null {
  if (payload.kind === 'prefab') return { kind: 'prefab', name: payload.name, weight: 1 };
  return payload.assetKind === 'model' ? { kind: 'model', name: payload.name, weight: 1 } : null;
}

const sourceLabel = (s: ScatterSource): string => (s.kind === 'type' ? `type: ${s.type}` : `${s.kind}: ${s.name}`);
const sourceKey = (s: ScatterSource): string => `${s.kind}:${s.kind === 'type' ? s.type : s.name}`;

function Row({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      {children}
      <span className="w-10 shrink-0 text-right tabular-nums">{value}</span>
    </label>
  );
}

function RangeInputs({ label, value, onChange, step }: { label: string; value: readonly [number, number]; onChange: (v: [number, number]) => void; step: number }) {
  const field = (i: 0 | 1, name: string) => (
    <input
      type="number"
      aria-label={`${label} ${name}`}
      step={step}
      value={value[i]}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(i === 0 ? [n, value[1]] : [value[0], n]);
      }}
      className="w-16 rounded border border-border bg-background px-1 py-0.5"
    />
  );
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      {field(0, 'min')}
      <span aria-hidden>to</span>
      {field(1, 'max')}
    </div>
  );
}

/**
 * The scatter brush's options (Phase 139 Theme H), shown in the editor's side column while the Scatter tool is
 * active. Sources come from the asset browser (click a model tile, or drag one in) and the prefab list; the
 * brush is radius, density, spacing and scale / rotation jitter; the seed has a "New seed" button.
 */
export function ScatterPanel({
  settings,
  onChange,
  prefabs,
  is3d,
  disabled,
}: {
  settings: ScatterSettings;
  onChange: (next: ScatterSettings) => void;
  prefabs: readonly GamePrefabListEntry[];
  is3d: boolean;
  disabled?: boolean;
}) {
  const [type, setType] = useState('');
  const has = (s: ScatterSource) => settings.sources.some((x) => sourceKey(x) === sourceKey(s));
  const add = (s: ScatterSource) => {
    if (!has(s) && settings.sources.length < 16) onChange({ ...settings, sources: [...settings.sources, s] });
  };
  const remove = (s: ScatterSource) => onChange({ ...settings, sources: settings.sources.filter((x) => sourceKey(x) !== sourceKey(s)) });
  const set = (patch: Partial<ScatterSettings>) => onChange({ ...settings, ...patch });
  const pickable = prefabs.filter((p) => !p.issue && (p.dimension === null || (p.dimension === '3d') === is3d) && !has({ kind: 'prefab', name: p.name, weight: 1 }));

  return (
    <section aria-label="Scatter brush" data-testid="scatter-panel" className="flex flex-col gap-2">
      <div
        data-testid="scatter-sources"
        onDragOver={(e) => {
          if (isAssetDrag(e.dataTransfer)) e.preventDefault();
        }}
        onDrop={(e) => {
          const payload = readDroppedAsset(e.dataTransfer);
          const source = payload ? sourceFromPayload(payload) : null;
          if (source) {
            e.preventDefault();
            add(source);
          }
        }}
        className="flex min-h-12 flex-wrap content-start gap-1 rounded border border-dashed border-border p-1.5"
      >
        {settings.sources.length === 0 ? <span className="text-muted-foreground">Click a model or prefab tile, or drop one here.</span> : null}
        {settings.sources.map((s) => (
          <span key={sourceKey(s)} className="inline-flex items-center gap-1 rounded border border-border bg-accent/40 px-1.5 py-0.5">
            {sourceLabel(s)}
            <button type="button" aria-label={`Remove ${sourceLabel(s)}`} disabled={disabled} onClick={() => remove(s)} className="text-muted-foreground hover:text-foreground">
              <LuX aria-hidden className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <select
          aria-label="Add a prefab"
          value=""
          disabled={disabled || pickable.length === 0}
          onChange={(e) => e.target.value && add({ kind: 'prefab', name: e.target.value, weight: 1 })}
          className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-0.5"
        >
          <option value="">{pickable.length === 0 ? 'No prefabs to add' : 'Add a prefab…'}</option>
          {pickable.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          const t = type.trim();
          if (!t) return;
          add({ kind: 'type', type: t, weight: 1 });
          setType('');
        }}
      >
        <input aria-label="Add an entity type" placeholder="Entity type, e.g. coin" value={type} onChange={(e) => setType(e.target.value)} className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-0.5" />
        <button type="submit" disabled={disabled || !type.trim()} className="rounded border border-border px-1.5 py-0.5 hover:bg-accent disabled:opacity-40">
          Add
        </button>
      </form>
      <Row label="Radius" value={`${settings.radius}`}>
        <BrandSlider aria-label="Radius" min={8} max={600} step={1} value={settings.radius} disabled={disabled} onValueChange={(v) => set({ radius: v })} className="flex-1" />
      </Row>
      <Row label="Density" value={`${settings.density}`}>
        <BrandSlider aria-label="Density" min={0.1} max={20} step={0.1} value={settings.density} disabled={disabled} onValueChange={(v) => set({ density: Math.round(v * 10) / 10 })} className="flex-1" />
      </Row>
      <Row label="Spacing" value={`${settings.spacing}`}>
        <BrandSlider aria-label="Spacing" min={0} max={200} step={1} value={settings.spacing} disabled={disabled} onValueChange={(v) => set({ spacing: v })} className="flex-1" />
      </Row>
      <RangeInputs label="Scale" value={settings.scale ?? [1, 1]} step={0.05} onChange={(v) => set({ scale: [Math.max(0.01, v[0]), Math.max(0.01, v[1])] })} />
      <RangeInputs label="Rotation" value={settings.rotation ?? [0, 360]} step={15} onChange={(v) => set({ rotation: v })} />
      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-muted-foreground">Seed</span>
        <span data-testid="scatter-seed" className="min-w-0 flex-1 truncate tabular-nums">
          {settings.seed}
        </span>
        <IconButton icon={LuDices} label="New seed" size="sm" disabled={disabled} onClick={() => set({ seed: newSeed() })} data-testid="scatter-new-seed" />
      </div>
      <p className="text-muted-foreground">Drag to paint. Alt erases the chosen sources. [ and ] resize the brush.</p>
    </section>
  );
}
