import type { ModelSculptPart } from '../../media-model';
import {
  PBR_MAX_LAYERS,
  PbrLayerSchema,
  type ModelPbr,
  type PaintBlendMode,
  type PbrFill,
  type PbrLayer,
  type PbrLayerMask,
  type PbrPresetName,
} from '../../media-model-pbr';
import { PBR_PRESET_STACKS } from './presets';

/**
 * Layer-stack edits (Phase 104 Theme G), shared by the editor's Paint tab and the `model_layer_*` /
 * `model_material_set` tools so both name, order and validate layers the same way. Every function is pure and
 * answers either the new stack or a sentence saying why not.
 */
export type StackResult<T = ModelPbr> = { ok: true; value: T } | { ok: false; error: string };

export const emptyPbr = (): ModelPbr => ({ layers: [] });

/** A layer id not used in `pbr`, from a readable base (`paint`, `paint-2`…). */
export function freshLayerId(pbr: ModelPbr | undefined, base = 'layer'): string {
  const stem =
    base
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 18) || 'layer';
  const used = new Set((pbr?.layers ?? []).map((l) => l.id));
  if (!used.has(stem)) return stem;
  for (let n = 2; ; n += 1) if (!used.has(`${stem}-${n}`)) return `${stem}-${n}`;
}

/** A layer by id, or by a name only one layer has. */
export function findPbrLayer(pbr: ModelPbr | undefined, ref: string): number {
  const layers = pbr?.layers ?? [];
  const byId = layers.findIndex((l) => l.id === ref);
  if (byId >= 0) return byId;
  const byName = layers.flatMap((l, i) => (l.name === ref ? [i] : []));
  return byName.length === 1 ? byName[0]! : -1;
}

const layerList = (pbr: ModelPbr | undefined): string => (pbr?.layers ?? []).map((l) => `${l.id} (${l.name})`).join(', ') || '(none)';

export type NewLayer = { kind: 'fill' | 'paint'; name?: string; id?: string; fill?: PbrFill; mask?: PbrLayerMask; blend?: PaintBlendMode; opacity?: number; hidden?: boolean };

/** Adds a layer at `index` (default: on top). */
export function addPbrLayer(pbr: ModelPbr | undefined, layer: NewLayer, index?: number): StackResult<{ pbr: ModelPbr; layer: PbrLayer }> {
  const base = pbr ?? emptyPbr();
  if (base.layers.length >= PBR_MAX_LAYERS) return { ok: false, error: `A material holds at most ${PBR_MAX_LAYERS} layers — remove one first.` };
  const name = layer.name ?? (layer.kind === 'fill' ? 'Fill' : 'Paint');
  const id = layer.id ?? freshLayerId(base, layer.kind === 'paint' ? 'paint' : name);
  if (base.layers.some((l) => l.id === id)) return { ok: false, error: `A layer with id "${id}" already exists.` };
  const parsed = PbrLayerSchema.safeParse({
    id,
    name,
    kind: layer.kind,
    ...(layer.hidden ? { hidden: true } : {}),
    ...(layer.opacity !== undefined && layer.opacity !== 1 ? { opacity: layer.opacity } : {}),
    ...(layer.blend && layer.blend !== 'normal' ? { blend: layer.blend } : {}),
    ...(layer.fill ? { fill: layer.fill } : {}),
    ...(layer.mask ? { mask: layer.mask } : {}),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.') || 'layer'}: ${i.message}`).join('; ') };
  if (parsed.data.kind === 'fill' && !parsed.data.fill) return { ok: false, error: 'A fill layer needs `fill` values (albedo, roughness, metalness, ao or emissive).' };
  const at = index === undefined ? base.layers.length : Math.max(0, Math.min(base.layers.length, index));
  const layers = [...base.layers];
  layers.splice(at, 0, parsed.data);
  return { ok: true, value: { pbr: { ...base, layers }, layer: parsed.data } };
}

export type LayerPatch = {
  name?: string;
  hidden?: boolean;
  opacity?: number;
  blend?: PaintBlendMode;
  /** Merged into the fill; `null` clears a key. */
  fill?: { [K in keyof PbrFill]?: PbrFill[K] | null };
  /** Replaces the mask; `null` removes it. */
  mask?: PbrLayerMask | null;
  /** Moves the layer to this position (0 = bottom). */
  index?: number;
};

export function updatePbrLayer(pbr: ModelPbr | undefined, ref: string, patch: LayerPatch): StackResult {
  const at = findPbrLayer(pbr, ref);
  if (!pbr || at < 0) return { ok: false, error: `No layer has id "${ref}" or a unique name "${ref}". Layers: ${layerList(pbr)}.` };
  const current = pbr.layers[at]!;
  const next: Record<string, unknown> = { ...current };
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.hidden !== undefined) {
    if (patch.hidden) next.hidden = true;
    else delete next.hidden;
  }
  if (patch.opacity !== undefined) {
    if (patch.opacity === 1) delete next.opacity;
    else next.opacity = patch.opacity;
  }
  if (patch.blend !== undefined) {
    if (patch.blend === 'normal') delete next.blend;
    else next.blend = patch.blend;
  }
  if (patch.fill !== undefined) {
    const fill: Record<string, unknown> = { ...(current.fill ?? {}) };
    for (const [key, value] of Object.entries(patch.fill)) {
      if (value === null) delete fill[key];
      else if (value !== undefined) fill[key] = value;
    }
    if (Object.keys(fill).length > 0) next.fill = fill;
    else delete next.fill;
  }
  if (patch.mask !== undefined) {
    if (patch.mask === null) delete next.mask;
    else next.mask = patch.mask;
  }
  const parsed = PbrLayerSchema.safeParse(next);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.') || 'layer'}: ${i.message}`).join('; ') };
  if (parsed.data.kind === 'fill' && !parsed.data.fill) return { ok: false, error: 'A fill layer must keep at least one fill value.' };
  const layers = [...pbr.layers];
  layers[at] = parsed.data;
  if (patch.index !== undefined && patch.index !== at) {
    const [moved] = layers.splice(at, 1);
    layers.splice(Math.max(0, Math.min(layers.length, patch.index)), 0, moved!);
  }
  return { ok: true, value: { ...pbr, layers } };
}

export function removePbrLayer(pbr: ModelPbr | undefined, ref: string): StackResult<{ pbr: ModelPbr; layer: PbrLayer }> {
  const at = findPbrLayer(pbr, ref);
  if (!pbr || at < 0) return { ok: false, error: `No layer has id "${ref}" or a unique name "${ref}". Layers: ${layerList(pbr)}.` };
  const layer = pbr.layers[at]!;
  return { ok: true, value: { pbr: { ...pbr, layers: pbr.layers.filter((_, i) => i !== at) }, layer } };
}

/**
 * A sculpt part wearing a preset: its colour and material set from the preset, the preset's layers as the
 * stack, and (with `keepPaint`) the part's paint layers kept on top. The flattened set is dropped — the caller
 * flattens again.
 */
export function applyPbrPreset(part: ModelSculptPart, name: PbrPresetName, options: { keepPaint?: boolean } = {}): ModelSculptPart {
  const preset = PBR_PRESET_STACKS[name];
  const paint = options.keepPaint ? (part.pbr?.layers ?? []).filter((l) => l.kind === 'paint') : [];
  const taken = new Set(paint.map((l) => l.id));
  const layers = [...preset.layers.map((l) => (taken.has(l.id) ? { ...l, id: `${l.id}-p` } : l)), ...paint];
  const { flattened: _flattened, ...rest } = part.pbr ?? emptyPbr();
  return {
    ...part,
    color: preset.color,
    material: { ...(part.material ?? {}), roughness: preset.roughness, metalness: preset.metalness },
    pbr: { ...rest, layers, preset: name },
  };
}
