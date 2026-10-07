import {
  addPbrLayer,
  applyPbrPreset,
  PAINT_BLEND_MODES,
  PBR_CHANNELS,
  PBR_PRESET_STACKS,
  PBR_PRESETS,
  removePbrLayer,
  SCULPT_FALLOFFS,
  STAMP_PATTERNS,
  updatePbrLayer,
  type LayerPatch,
  type ModelPbr,
  type ModelSculptPart,
  type ModelSpec,
  type PaintBrushKind,
  type PaintTarget,
  type PbrLayer,
  type PbrPresetName,
} from '@midnite/studio-shared';
import { useState, type Dispatch } from 'react';
import {
  LuArrowDown,
  LuArrowUp,
  LuBrush,
  LuCopy,
  LuEraser,
  LuEye,
  LuEyeOff,
  LuFingerprint,
  LuLogOut,
  LuPaintBucket,
  LuPaintbrush,
  LuPlus,
  LuRedo2,
  LuStamp,
  LuTrash2,
  LuUndo2,
} from 'react-icons/lu';

import type { IconComponent } from '../../../components/icon-button';
import type { EditorAction, EditorState } from './editor-state';
import { ColorField, FIELD, NumberField, SECTION, SelectField, SliderField } from './fields';
import type { PaintController, PaintSettings, PaintSnapshot } from './paint/paint-controller';

/**
 * The Paint tab (Phase 104 Theme G): enter paint mode on an unwrapped sculpt part, pick a brush, a channel and
 * what it lays down, and manage the material's layer stack — fill and paint layers with opacity, blend mode and
 * a mask from a Theme F bake or painted by hand — plus the presets and the texture size. The viewport does the
 * painting; stack edits are ordinary undo steps in the editor.
 */
export const PAINT_BRUSH_LIST: readonly { kind: PaintBrushKind; label: string; icon: IconComponent; hint: string }[] = [
  { kind: 'brush', label: 'Brush', icon: LuPaintbrush, hint: 'Lay paint down' },
  { kind: 'eraser', label: 'Eraser', icon: LuEraser, hint: 'Take paint off the layer' },
  { kind: 'fill', label: 'Fill', icon: LuPaintBucket, hint: 'Flood the UV island under the cursor' },
  { kind: 'smudge', label: 'Smudge', icon: LuFingerprint, hint: 'Drag paint along the stroke' },
  { kind: 'clone', label: 'Clone', icon: LuCopy, hint: 'Alt-click a source, then paint a copy of it' },
  { kind: 'stamp', label: 'Stamp', icon: LuStamp, hint: 'Paint through an alpha pattern' },
];

const CHANNEL_LABELS: Record<PaintTarget, string> = { albedo: 'Base colour', roughness: 'Roughness', metalness: 'Metalness', normal: 'Normal', ao: 'Occlusion', emissive: 'Emissive', mask: 'Layer mask' };
const BUTTON = 'flex h-6 items-center gap-1 rounded-md border border-border bg-card px-2 text-[11px] text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50';
const ICON_BUTTON = 'flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40';
const SIZES = [512, 1024, 2048, 4096] as const;

export function PaintPanel({ state, dispatch, controller, snapshot }: { state: EditorState; dispatch: Dispatch<EditorAction>; controller: PaintController; snapshot: PaintSnapshot }) {
  const { spec, selected } = state;
  const [message, setMessage] = useState<string | null>(null);
  const s = snapshot.settings;
  const set = (patch: Partial<PaintSettings>) => controller.setSettings(patch);

  if (snapshot.status !== 'ready') {
    const candidates = spec.parts.flatMap((p, i) => (p.shape === 'sculpt' && !p.hidden ? [{ part: p, index: i }] : []));
    const chosen = selected !== null && spec.parts[selected]?.shape === 'sculpt' ? selected : (candidates.find((c) => c.part.shape === 'sculpt' && c.part.uv)?.index ?? candidates[0]?.index ?? null);
    const chosenPart = chosen !== null ? (spec.parts[chosen] as ModelSculptPart) : undefined;
    return (
      <div className="flex flex-col gap-2" role="group" aria-label="Paint">
        <p className="text-[11px] text-muted-foreground">
          Paint PBR textures on an unwrapped sculpt mesh: base colour, roughness, metalness, normal, occlusion and glow, in layers over its baked maps. Left-drag paints; orbit with the right button,
          pan with the middle one.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {chosenPart ? (
            <button type="button" className={BUTTON} disabled={snapshot.status === 'loading' || !chosenPart.uv} onClick={() => void controller.enter(spec, chosen!)}>
              <LuBrush aria-hidden className="h-3.5 w-3.5" />
              {snapshot.status === 'loading' ? 'Opening…' : `Paint ${chosenPart.name}`}
            </button>
          ) : (
            <p className="text-[11px] text-muted-foreground">There is no sculpt part yet. Convert the design in the Mesh tab, then decimate and unwrap it.</p>
          )}
          {chosenPart && !chosenPart.uv ? (
            <p className="text-[11px] text-muted-foreground" data-testid="paint-needs-uv">
              {chosenPart.name} has no UV layout, so it cannot hold textures yet. Ask the agent to decimate and unwrap it (`model_decimate`, `model_unwrap`, then `model_bake`).
            </p>
          ) : null}
        </div>
        {snapshot.error ? (
          <p role="alert" className="text-[11px] text-destructive">
            {snapshot.error}
          </p>
        ) : null}
      </div>
    );
  }

  const index = spec.parts.findIndex((p) => p.id === snapshot.partId);
  const part = spec.parts[index] as ModelSculptPart | undefined;
  if (!part) return null;
  const pbr: ModelPbr = part.pbr ?? { layers: [] };
  const writeStack = (next: ModelPbr) => dispatch({ type: 'patch', index, patch: { pbr: next } });
  const editLayer = (id: string, patch: LayerPatch) => {
    const out = updatePbrLayer(pbr, id, patch);
    if (out.ok) writeStack(out.value);
    else setMessage(out.error);
  };
  const addLayer = (kind: 'fill' | 'paint') => {
    const out = addPbrLayer(pbr, kind === 'fill' ? { kind, name: 'Fill', fill: { albedo: '#808080' } } : { kind, name: 'Paint' });
    if (!out.ok) return setMessage(out.error);
    writeStack(out.value.pbr);
    controller.setLayer(out.value.layer.id);
  };
  const applyPreset = (name: PbrPresetName) => {
    const next = applyPbrPreset(part, name, { keepPaint: true });
    dispatch({ type: 'patch', index, patch: { pbr: next.pbr, color: next.color, material: next.material } });
  };
  const setSize = (size: number) => writeStack({ ...pbr, sizes: Object.fromEntries(PBR_CHANNELS.map((c) => [c, size])) });
  const active = pbr.layers.find((l) => l.id === snapshot.layerId) ?? null;
  const exit = async () => {
    const out = await controller.exit(state.spec);
    if (!out.ok) setMessage(out.error);
  };
  const colourChannel = s.channel === 'albedo' || s.channel === 'emissive' || s.channel === 'normal';

  return (
    <div className="flex flex-col gap-2" role="group" aria-label="Paint">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] text-muted-foreground" data-testid="paint-status" role="status">
          Painting <span className="font-medium text-foreground">{part.name}</span> · {active ? `layer ${active.name}` : 'no layer yet — the first stroke adds one'}
          {snapshot.unsaved ? ' · unsaved' : ''}
          {snapshot.busy ? ` · ${snapshot.busy}` : ''}
        </p>
        <span className="ml-auto flex items-center gap-1">
          <button type="button" className={ICON_BUTTON} aria-label="Undo paint stroke" disabled={snapshot.undo === 0} onClick={() => controller.undo()}>
            <LuUndo2 aria-hidden className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={ICON_BUTTON} aria-label="Redo paint stroke" disabled={snapshot.redo === 0} onClick={() => controller.redo()}>
            <LuRedo2 aria-hidden className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={BUTTON} onClick={() => void exit()}>
            <LuLogOut aria-hidden className="h-3.5 w-3.5" />
            Done painting
          </button>
        </span>
      </div>
      {snapshot.error || message ? (
        <p role="alert" className="text-[11px] text-destructive">
          {snapshot.error ?? message}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <div role="radiogroup" aria-label="Paint brush" className="flex flex-wrap gap-1">
            {PAINT_BRUSH_LIST.map((b) => {
              const Icon = b.icon;
              return (
                <button
                  key={b.kind}
                  type="button"
                  role="radio"
                  aria-checked={s.brush === b.kind}
                  title={b.hint}
                  onClick={() => set({ brush: b.kind })}
                  className={`flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] ${s.brush === b.kind ? 'border-primary bg-primary/15 text-foreground' : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'}`}
                >
                  <Icon aria-hidden className="h-3.5 w-3.5" />
                  {b.label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SelectField
              label="Channel"
              value={s.channel}
              options={(Object.keys(CHANNEL_LABELS) as PaintTarget[]).map((c) => ({ value: c, label: CHANNEL_LABELS[c] }))}
              onChange={(channel) => set({ channel, ...(channel === 'normal' ? { color: '#8080ff' } : {}) })}
            />
            {colourChannel ? <ColorField label={s.channel === 'normal' ? 'Normal' : 'Colour'} value={s.color} onCommit={(color) => set({ color })} /> : null}
          </div>
          {!colourChannel ? <SliderField label={s.channel === 'mask' ? 'Reveal' : 'Value'} value={s.value} min={0} max={1} step={0.05} onCommit={(value) => set({ value })} /> : null}
          <div className="flex items-center gap-1.5">
            <span className="w-24 shrink-0 text-[11px] text-muted-foreground">Radius</span>
            <div className="flex w-16 shrink-0">
              {s.radiusUnit === 'screen' ? (
                <NumberField label="Paint radius" value={s.screenRadius} step={2} min={2} max={400} integer onCommit={(v) => v !== undefined && set({ screenRadius: v })} />
              ) : (
                <NumberField label="Paint radius" value={s.worldRadius} step={0.005} min={0.001} max={10} onCommit={(v) => v !== undefined && set({ worldRadius: v })} />
              )}
            </div>
            <select aria-label="Paint radius unit" value={s.radiusUnit} onChange={(e) => set({ radiusUnit: e.target.value as PaintSettings['radiusUnit'] })} className={`${FIELD} w-14 shrink-0`}>
              <option value="screen">px</option>
              <option value="world">m</option>
            </select>
          </div>
          <SliderField label="Strength" value={s.strength} min={0} max={1} step={0.05} onCommit={(strength) => set({ strength })} />
          <SelectField label="Falloff" value={s.falloff} options={SCULPT_FALLOFFS.map((f) => ({ value: f, label: f[0]!.toUpperCase() + f.slice(1) }))} onChange={(falloff) => set({ falloff })} />
          {s.brush === 'stamp' ? (
            <SelectField label="Stamp" value={s.stamp} options={STAMP_PATTERNS.map((p) => ({ value: p, label: p[0]!.toUpperCase() + p.slice(1) }))} onChange={(stamp) => set({ stamp })} />
          ) : null}
          {s.brush === 'clone' ? (
            <p className="text-[11px] text-muted-foreground" data-testid="paint-clone-hint">
              {snapshot.cloneSource ? 'Clone source set — paint to copy from it.' : 'Alt-click the surface to set where to copy from.'}
            </p>
          ) : null}
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <input type="checkbox" checked={s.frontFacesOnly} onChange={(e) => set({ frontFacesOnly: e.target.checked })} />
            Front faces only
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className={SECTION}>Layers</p>
            <span className="ml-auto" />
            <SelectField
              label="Preset"
              value={pbr.preset ?? ''}
              options={[{ value: '', label: '—' }, ...PBR_PRESETS.map((p) => ({ value: p, label: PBR_PRESET_STACKS[p].label }))]}
              onChange={(name) => name && applyPreset(name as PbrPresetName)}
            />
            <SelectField
              label="Size"
              value={String(pbr.sizes?.albedo ?? part.uv?.textureSize ?? 2048)}
              options={SIZES.map((n) => ({ value: String(n), label: `${n / 1024 >= 1 ? `${n / 1024}K` : n}` }))}
              onChange={(size) => setSize(Number(size))}
            />
          </div>
          <ul className="flex flex-col gap-0.5" aria-label="Material layers" data-testid="paint-layers">
            {[...pbr.layers].reverse().map((layer) => (
              <LayerRow
                key={layer.id}
                layer={layer}
                active={layer.id === snapshot.layerId}
                first={pbr.layers[pbr.layers.length - 1]?.id === layer.id}
                last={pbr.layers[0]?.id === layer.id}
                bakes={Object.keys(part.maps ?? {})}
                onSelect={() => controller.setLayer(layer.id)}
                onEdit={(patch) => editLayer(layer.id, patch)}
                onMove={(by) => editLayer(layer.id, { index: pbr.layers.findIndex((l) => l.id === layer.id) + by })}
                onRemove={() => {
                  const out = removePbrLayer(pbr, layer.id);
                  if (out.ok) writeStack(out.value.pbr);
                }}
              />
            ))}
            <li className="px-1 text-[11px] text-muted-foreground">
              Base · <span className="font-mono">{part.color}</span>
              {part.maps ? ` · bakes: ${Object.keys(part.maps).join(', ')}` : ' · no bakes'}
            </li>
          </ul>
          <div className="flex gap-1.5">
            <button type="button" className={BUTTON} onClick={() => addLayer('fill')}>
              <LuPlus aria-hidden className="h-3.5 w-3.5" />
              Fill layer
            </button>
            <button type="button" className={BUTTON} onClick={() => addLayer('paint')}>
              <LuPlus aria-hidden className="h-3.5 w-3.5" />
              Paint layer
            </button>
          </div>
          {active?.kind === 'fill' ? <FillEditor layer={active} onEdit={(patch) => editLayer(active.id, patch)} /> : null}
        </div>
      </div>
    </div>
  );
}

function LayerRow({
  layer,
  active,
  first,
  last,
  bakes,
  onSelect,
  onEdit,
  onMove,
  onRemove,
}: {
  layer: PbrLayer;
  active: boolean;
  first: boolean;
  last: boolean;
  bakes: string[];
  onSelect: () => void;
  onEdit: (patch: LayerPatch) => void;
  onMove: (by: number) => void;
  onRemove: () => void;
}) {
  const maskValue = layer.mask ? `${layer.mask.invert ? '!' : ''}${layer.mask.source}` : '';
  const maskOptions = [{ value: '', label: 'No mask' }, ...['curvature', 'cavity', 'ao'].flatMap((b) => [
    { value: b, label: `${b}${bakes.includes(b) ? '' : ' (not baked)'}` },
    { value: `!${b}`, label: `inverted ${b}` },
  ]), { value: 'painted', label: 'painted' }];
  return (
    <li className={`flex flex-wrap items-center gap-1 rounded-md border px-1 py-0.5 ${active ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-accent/50'}`} data-testid={`paint-layer-${layer.id}`}>
      <button type="button" className={ICON_BUTTON} aria-label={layer.hidden ? `Show ${layer.name}` : `Hide ${layer.name}`} onClick={() => onEdit({ hidden: !layer.hidden })}>
        {layer.hidden ? <LuEyeOff aria-hidden className="h-3.5 w-3.5" /> : <LuEye aria-hidden className="h-3.5 w-3.5" />}
      </button>
      <button type="button" role="radio" aria-checked={active} aria-label={`Paint on ${layer.name}`} onClick={onSelect} className="min-w-0 flex-1 truncate text-left text-[11px] text-foreground">
        {layer.name} <span className="text-muted-foreground">· {layer.kind}</span>
      </button>
      <input
        aria-label={`${layer.name} opacity`}
        type="range"
        min={0}
        max={1}
        step={0.05}
        defaultValue={layer.opacity ?? 1}
        key={`${layer.id}-${layer.opacity ?? 1}`}
        onPointerUp={(e) => onEdit({ opacity: Number((e.target as HTMLInputElement).value) })}
        onKeyUp={(e) => onEdit({ opacity: Number((e.target as HTMLInputElement).value) })}
        className="h-1 w-14"
      />
      <select aria-label={`${layer.name} blend mode`} value={layer.blend ?? 'normal'} onChange={(e) => onEdit({ blend: e.target.value as (typeof PAINT_BLEND_MODES)[number] })} className={`${FIELD} w-20`}>
        {PAINT_BLEND_MODES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select
        aria-label={`${layer.name} mask`}
        value={maskValue}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return onEdit({ mask: null });
          const invert = v.startsWith('!');
          const source = (invert ? v.slice(1) : v) as 'curvature' | 'cavity' | 'ao' | 'painted';
          onEdit({ mask: { source, ...(invert ? { invert: true } : {}), ...(source === 'curvature' ? { low: 0.55, high: 0.75 } : source === 'painted' ? {} : { low: 0.4, high: 0.97 }) } });
        }}
        className={`${FIELD} w-24`}
      >
        {maskOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button type="button" className={ICON_BUTTON} aria-label={`Move ${layer.name} up`} disabled={first} onClick={() => onMove(1)}>
        <LuArrowUp aria-hidden className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={ICON_BUTTON} aria-label={`Move ${layer.name} down`} disabled={last} onClick={() => onMove(-1)}>
        <LuArrowDown aria-hidden className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={ICON_BUTTON} aria-label={`Delete ${layer.name}`} onClick={onRemove}>
        <LuTrash2 aria-hidden className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

function FillEditor({ layer, onEdit }: { layer: PbrLayer; onEdit: (patch: LayerPatch) => void }) {
  const fill = layer.fill ?? {};
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border/60 p-1.5" role="group" aria-label={`${layer.name} fill`}>
      <div className="flex flex-wrap items-center gap-2">
        <ColorField label="Colour" value={fill.albedo ?? '#808080'} onCommit={(albedo) => onEdit({ fill: { albedo } })} />
        <ColorField label="Glow" value={fill.emissive ?? '#000000'} onCommit={(emissive) => onEdit({ fill: { emissive: emissive === '#000000' ? null : emissive } })} />
      </div>
      <SliderField label="Roughness" value={fill.roughness ?? 0.5} min={0} max={1} step={0.05} onCommit={(roughness) => onEdit({ fill: { roughness } })} />
      <SliderField label="Metalness" value={fill.metalness ?? 0} min={0} max={1} step={0.05} onCommit={(metalness) => onEdit({ fill: { metalness } })} />
      <SliderField label="Noise" value={fill.noise?.amount ?? 0} min={0} max={1} step={0.05} onCommit={(amount) => onEdit({ fill: { noise: amount > 0 ? { scale: fill.noise?.scale ?? 12, ...fill.noise, amount } : null } })} />
    </div>
  );
}

/** The spec a save should write: live paint flushed first when paint mode is on. */
export async function specForPaintSave(controller: PaintController | null, spec: ModelSpec): Promise<{ ok: true; spec: ModelSpec } | { ok: false; error: string }> {
  return controller ? controller.flush(spec) : { ok: true, spec };
}
