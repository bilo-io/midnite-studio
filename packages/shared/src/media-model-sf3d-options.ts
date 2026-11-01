/**
 * SF3D's generation settings (texture size and every pipeline knob), on their own so `media-model.ts`'s
 * engine seam and the MCP schemas can take them without importing `media-model-sf3d.ts`, which imports
 * `media-model.ts`.
 */
import { z } from 'zod';

import { ModelAnatomySchema, ModelFacingSchema } from './media-model-rig';

/** Texture atlas edge, in texels; the bake queries the colour MLP once per covered texel. */
export const SF3D_TEXTURE_SIZES = [512, 1024, 2048, 4096] as const;
export const SF3D_DEFAULT_TEXTURE_SIZE = 1024;
export const Sf3dTextureSizeSchema = z.union([z.literal(512), z.literal(1024), z.literal(2048), z.literal(4096)]);
export type Sf3dTextureSize = z.infer<typeof Sf3dTextureSizeSchema>;

/**
 * Every SF3D setting besides the texture size, with the value a run uses when it is left out. The
 * triplane's 40 channels are not here: the graph is built for exactly 40.
 */
export const SF3D_OPTION_DEFAULTS = {
  /** Cut an opaque picture's background out (an edge flood fill on the corner colour) before SF3D sees it. */
  removeBackground: false,
  /** How far, per channel (0–255), a pixel may sit from the background colour and still be cut. */
  backgroundTolerance: 28,
  /** How much of the 512² frame a cut-out object fills (SF3D's `foreground_ratio`). */
  foregroundRatio: 0.85,
  /** Density above which the decoder's field counts as solid (`isosurface_threshold`); lower is fuller. */
  threshold: 10,
  /** Deformation scale: grid offsets move each vertex by up to `1 / resolution` (`isosurface_resolution`). */
  resolution: 160,
  roughness: 0.6,
  metalness: 0,
  /** The conditioning camera's distance from the object (`default_cond_c2w`). */
  cameraDistance: 1.6,
  /** The conditioning camera's field of view, in degrees. */
  fov: 40,
  /** Grid points per decoder call — speed and memory only, never the result. */
  decodeBatch: 131_072,
} as const;
export type Sf3dOptionKey = keyof typeof SF3D_OPTION_DEFAULTS;

/** Slider/input bounds the form and the schema share. */
export const SF3D_OPTION_RANGES = {
  backgroundTolerance: { min: 4, max: 96, step: 1 },
  foregroundRatio: { min: 0.5, max: 1, step: 0.01 },
  threshold: { min: 0, max: 40, step: 0.5 },
  resolution: { min: 40, max: 320, step: 8 },
  roughness: { min: 0, max: 1, step: 0.05 },
  metalness: { min: 0, max: 1, step: 0.05 },
  cameraDistance: { min: 1, max: 3, step: 0.05 },
  fov: { min: 15, max: 75, step: 1 },
  decodeBatch: { min: 8_192, max: 524_288, step: 8_192 },
} as const satisfies Record<Exclude<Sf3dOptionKey, 'removeBackground'>, { min: number; max: number; step: number }>;

const ranged = (key: keyof typeof SF3D_OPTION_RANGES) => z.number().min(SF3D_OPTION_RANGES[key].min).max(SF3D_OPTION_RANGES[key].max);

export const Sf3dOptionsSchema = z.object({
  removeBackground: z.boolean().optional(),
  backgroundTolerance: ranged('backgroundTolerance').optional(),
  foregroundRatio: ranged('foregroundRatio').optional(),
  threshold: ranged('threshold').optional(),
  resolution: ranged('resolution').int().optional(),
  roughness: ranged('roughness').optional(),
  metalness: ranged('metalness').optional(),
  cameraDistance: ranged('cameraDistance').optional(),
  fov: ranged('fov').optional(),
  decodeBatch: ranged('decodeBatch').int().optional(),
});
export type Sf3dOptions = z.infer<typeof Sf3dOptionsSchema>;
export type Sf3dResolvedOptions = { -readonly [K in Sf3dOptionKey]: (typeof SF3D_OPTION_DEFAULTS)[K] extends boolean ? boolean : number };

export function resolveSf3dOptions(options: Sf3dOptions | undefined): Sf3dResolvedOptions {
  const set = Object.fromEntries(Object.entries(options ?? {}).filter(([, v]) => v !== undefined)) as Partial<Sf3dResolvedOptions>;
  return { ...SF3D_OPTION_DEFAULTS, ...set };
}

/** Short name tokens for the settings that change the result, in file-name order. `decodeBatch` changes nothing, so it has none. */
const SUFFIX: [Exclude<Sf3dOptionKey, 'removeBackground' | 'backgroundTolerance' | 'decodeBatch'>, string, number][] = [
  ['foregroundRatio', 'fg', 100],
  ['threshold', 'th', 1],
  ['resolution', 'def', 1],
  ['roughness', 'rough', 100],
  ['metalness', 'metal', 100],
  ['cameraDistance', 'cam', 100],
  ['fov', 'fov', 1],
];

/**
 * The settings that differ from the defaults, as a file-name suffix — `tex2048-bg-th8` — so models made
 * from one picture with different settings sit side by side and say how they differ. Empty when nothing changed.
 */
export function sf3dSettingsSuffix(textureSize: number | undefined, options: Sf3dOptions | undefined): string {
  const o = resolveSf3dOptions(options);
  const parts: string[] = [];
  if (textureSize !== undefined && textureSize !== SF3D_DEFAULT_TEXTURE_SIZE) parts.push(`tex${textureSize}`);
  if (o.removeBackground) parts.push(o.backgroundTolerance === SF3D_OPTION_DEFAULTS.backgroundTolerance ? 'bg' : `bg${o.backgroundTolerance}`);
  for (const [key, token, scale] of SUFFIX) {
    if (o[key] !== SF3D_OPTION_DEFAULTS[key]) parts.push(`${token}${String(Math.round(o[key] * scale * 10) / 10).replace('.', 'p')}`);
  }
  return parts.join('-');
}

/**
 * The auto-rig an SF3D run finishes with: the same `setAnatomy` the Rig tab's Auto-rig runs, applied to the
 * freshly imported mesh. Absent or `static` leaves the model unrigged; `facing` is the way the picture's
 * subject faces (default `+z`). `media-model-rig.ts` is zod-only, so this adds no import cycle.
 */
export const Sf3dRigShape = { anatomy: ModelAnatomySchema.optional(), facing: ModelFacingSchema.optional() } as const;
