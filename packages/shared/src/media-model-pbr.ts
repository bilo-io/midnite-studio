import { z } from 'zod';

/**
 * PBR materials and texture painting on `sculpt` parts (Phase 104 Theme G).
 *
 * A painted sculpt part carries a **layer stack** (`pbr.layers`, bottom → top) over its base surface — the
 * part's own `color` and `material`, plus Theme F's baked `ao` and `normal` maps where it has them. Each layer
 * is either a **fill** (constant channel values, optionally varied by object-space noise) or a **paint** layer
 * (one RGBA PNG per channel it paints, alpha = how much paint is there). A layer can be masked by a Theme F
 * bake (curvature for edge wear, cavity or ambient occlusion for dirt) or by a painted mask, and composes with
 * an opacity and a blend mode.
 *
 * Flattening the stack yields the glTF set: `baseColor`, the packed occlusion/roughness/metalness `orm`
 * (R = occlusion, G = roughness, B = metalness — glTF's own channel order, so `occlusionTexture` and
 * `metallicRoughnessTexture` share one image), a tangent-space `normal` and `emissive`. That set is rewritten
 * beside the design whenever the stack or a paint layer changes, so exports and the viewport never flatten.
 *
 * Kept free of `media-model.ts` (which embeds it in the `sculpt` part) so neither imports the other.
 */

/** `#rgb` or `#rrggbb` (the same rule as `ModelColorSchema`). */
const hex = z.string().regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i, 'must be a #rrggbb hex colour');
const unit = z.number().finite().min(0).max(1);

/** A map beside the design (Phase 104 Themes F and G): a relative `.png` path, no `..`. */
export const ModelMapSrcSchema = z
  .string()
  .min(5)
  .max(200)
  .regex(/^[^/\\\0]+(\/[^/\\\0]+)*\.png$/i, 'must be a relative .png path')
  .refine((src) => !src.split('/').some((segment) => segment === '..' || segment === '.'), 'must stay inside the model folder');

/** One map file: its name and content hash, so a changed file is never mistaken for it. */
export const ModelMapFileSchema = z.object({ src: ModelMapSrcSchema, hash: z.string().regex(/^[0-9a-f]{8,64}$/, 'must be a lower-case hex hash') });
export type ModelMapFile = z.infer<typeof ModelMapFileSchema>;
export const MODEL_MAP_KINDS = ['normal', 'ao', 'curvature', 'cavity'] as const;

/** The channels a material has. `normal` is tangent space; `ao` multiplies the baked occlusion. */
export const PBR_CHANNELS = ['albedo', 'roughness', 'metalness', 'normal', 'ao', 'emissive'] as const;
export type PbrChannel = (typeof PBR_CHANNELS)[number];
/** What a paint brush may paint: a channel, or the layer's own mask. */
export const PAINT_TARGETS = [...PBR_CHANNELS, 'mask'] as const;
export type PaintTarget = (typeof PAINT_TARGETS)[number];
/** Channels holding colour (three components); the rest are one value, stored in red. */
export const PBR_COLOR_CHANNELS: ReadonlySet<PaintTarget> = new Set(['albedo', 'emissive', 'normal']);

export const PAINT_BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'add', 'subtract', 'darken', 'lighten'] as const;
export type PaintBlendMode = (typeof PAINT_BLEND_MODES)[number];

export const PBR_PRESETS = ['skin', 'metal', 'painted_metal', 'wood', 'stone', 'fabric', 'plastic'] as const;
export type PbrPresetName = (typeof PBR_PRESETS)[number];

export const PBR_SIZE_MIN = 64;
export const PBR_SIZE_MAX = 4096;
/** The default edge of a channel's texture when the unwrap does not name one (2K, as the phase decided). */
export const PBR_SIZE_DEFAULT = 2048;
export const PBR_MAX_LAYERS = 16;

/** Where a layer's mask comes from: a Theme F bake, or a mask painted on the layer itself. */
export const PBR_MASK_SOURCES = ['curvature', 'cavity', 'ao', 'painted'] as const;
export const PbrLayerMaskSchema = z
  .object({
    source: z.enum(PBR_MASK_SOURCES),
    /** Use the opposite of the source (convex instead of concave). */
    invert: z.boolean().optional(),
    /** A smoothstep over the source value (0–1): below `low` hides, above `high` shows. Default 0 → 1. */
    low: unit.optional(),
    high: unit.optional(),
  })
  .refine((m) => (m.low ?? 0) <= (m.high ?? 1), 'low must not exceed high');
export type PbrLayerMask = z.infer<typeof PbrLayerMaskSchema>;

/** Object-space value noise that varies a fill (grain for wood, mottling for stone and skin). */
export const PbrNoiseSchema = z.object({
  /** Features per metre. */
  scale: z.number().finite().min(0.01).max(2000),
  /** How far the noise pushes the value (0 = none, 1 = ±100 %). */
  amount: unit,
  /** Per-axis stretch: `[1, 12, 1]` draws streaks along Y (wood grain, woven threads). */
  stretch: z.tuple([z.number().finite().min(0.01).max(100), z.number().finite().min(0.01).max(100), z.number().finite().min(0.01).max(100)]).optional(),
  octaves: z.number().int().min(1).max(5).optional(),
  seed: z.number().int().min(0).max(1_000_000).optional(),
});
export type PbrNoise = z.infer<typeof PbrNoiseSchema>;

/** A fill layer's values: only the channels named are touched. */
export const PbrFillSchema = z.object({
  albedo: hex.optional(),
  roughness: unit.optional(),
  metalness: unit.optional(),
  ao: unit.optional(),
  emissive: hex.optional(),
  noise: PbrNoiseSchema.optional(),
});
export type PbrFill = z.infer<typeof PbrFillSchema>;

/** A layer id is part of its files' names, so it is short and file-safe. */
export const PbrLayerIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,23}$/, 'must be 1–24 lower-case letters, digits or dashes');

const layerMaps = z.object({
  albedo: ModelMapFileSchema.optional(),
  roughness: ModelMapFileSchema.optional(),
  metalness: ModelMapFileSchema.optional(),
  normal: ModelMapFileSchema.optional(),
  ao: ModelMapFileSchema.optional(),
  emissive: ModelMapFileSchema.optional(),
  mask: ModelMapFileSchema.optional(),
});

export const PbrLayerSchema = z.object({
  id: PbrLayerIdSchema,
  name: z.string().trim().min(1).max(60),
  kind: z.enum(['fill', 'paint']),
  hidden: z.boolean().optional(),
  /** 0–1, default 1. */
  opacity: unit.optional(),
  /** Default `normal`. The normal channel always combines as detail over what is below (whiteout), whatever the mode. */
  blend: z.enum(PAINT_BLEND_MODES).optional(),
  /** A fill layer's values. */
  fill: PbrFillSchema.optional(),
  mask: PbrLayerMaskSchema.optional(),
  /** A paint layer's pixels per channel, and a painted mask: RGBA PNGs beside the design, alpha = coverage. */
  maps: layerMaps.optional(),
});
export type PbrLayer = z.infer<typeof PbrLayerSchema>;

const size = z.number().int().min(PBR_SIZE_MIN).max(PBR_SIZE_MAX);

/** The flattened export set (glTF's material textures). */
export const PBR_OUTPUTS = ['baseColor', 'orm', 'normal', 'emissive'] as const;
export type PbrOutput = (typeof PBR_OUTPUTS)[number];
/** Which output each channel lands in. */
export const PBR_OUTPUT_OF: Record<PbrChannel, PbrOutput> = { albedo: 'baseColor', roughness: 'orm', metalness: 'orm', ao: 'orm', normal: 'normal', emissive: 'emissive' };

export const ModelPbrSchema = z
  .object({
    /** Texture edge per channel; absent ones use the unwrap's `textureSize` (else 2048). */
    sizes: z
      .object({ albedo: size.optional(), roughness: size.optional(), metalness: size.optional(), normal: size.optional(), ao: size.optional(), emissive: size.optional() })
      .optional(),
    /** Bottom → top. */
    layers: z.array(PbrLayerSchema).max(PBR_MAX_LAYERS),
    /** The preset the stack started from, for the UI's label. */
    preset: z.enum(PBR_PRESETS).optional(),
    /** The flattened set, rewritten whenever the stack changes. */
    flattened: z
      .object({ baseColor: ModelMapFileSchema.optional(), orm: ModelMapFileSchema.optional(), normal: ModelMapFileSchema.optional(), emissive: ModelMapFileSchema.optional() })
      .optional(),
  })
  .refine((pbr) => new Set(pbr.layers.map((l) => l.id)).size === pbr.layers.length, 'layer ids must be unique');
export type ModelPbr = z.infer<typeof ModelPbrSchema>;

/** The channel sizes a part resolves to. */
export function pbrSizes(pbr: Pick<ModelPbr, 'sizes'> | undefined, textureSize?: number): Record<PbrChannel, number> {
  const fallback = Math.min(PBR_SIZE_MAX, Math.max(PBR_SIZE_MIN, textureSize ?? PBR_SIZE_DEFAULT));
  const out = {} as Record<PbrChannel, number>;
  for (const channel of PBR_CHANNELS) out[channel] = pbr?.sizes?.[channel] ?? fallback;
  return out;
}

/** Every map file a stack names (its layers' pixels and masks, and the flattened set). */
export function pbrFiles(pbr: ModelPbr | undefined): ModelMapFile[] {
  if (!pbr) return [];
  const out: ModelMapFile[] = [];
  for (const layer of pbr.layers) for (const file of Object.values(layer.maps ?? {})) if (file) out.push(file);
  for (const file of Object.values(pbr.flattened ?? {})) if (file) out.push(file);
  return out;
}
