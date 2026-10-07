/**
 * Media ▸ Models over MCP — the `model_*` tools an agent uses to build a 3D
 * model iteratively: write a design, render it, look at the picture, patch it,
 * save. Registered in `MCP_TOOLS` (`mcp.ts`) like every other tool.
 *
 * **Everything about a part comes from `ModelPartSchema`.** Nothing here lists
 * fields or shapes: the tools take parts as open records and main validates
 * them against the live schema (`media-model.ts`), so a new part kind or a new
 * material field reaches the agent — through `model_get_spec`'s derived schema
 * and the prompt's derived reference — without this file changing.
 *
 * **Connecting a session of your own.** These are ordinary Midnite MCP tools:
 * enable Settings ▸ MCP, turn on "Let agents edit 3D models", then
 * `claude mcp add midnite -- node <shim path from Settings ▸ MCP>`.
 */
import { z } from 'zod';

import { MediaProjectNameSchema } from './media';
import { ModelColorSchema, ModelSpecSchema } from './media-model';
import { ReferenceViewNameSchema, ReferenceViewsSchema } from './media-model-reference';
import { AIM_MAX_POINTS, AimViewSchema, BAKE_KINDS, BAKE_SIZE_MAX, BAKE_SIZE_MIN, ModelSculptTargetSchema, PAINT_BRUSHES, SCULPT_BRUSHES, SCULPT_FALLOFFS, SculptSymmetrySchema, STAMP_PATTERNS } from './model-geometry';
import {
  ModelMapSrcSchema,
  PAINT_BLEND_MODES,
  PAINT_TARGETS,
  PBR_CHANNELS,
  PBR_PRESETS,
  PBR_SIZE_MAX,
  PBR_SIZE_MIN,
  PbrFillSchema,
  PbrLayerMaskSchema,
  PbrNoiseSchema,
} from './media-model-pbr';
import { SDF_RESOLUTION_MAX, SDF_RESOLUTION_MIN } from './media-model-sdf';
import { SF3D_GENERATE_STAGES, SF3D_STATES } from './media-model-sf3d';
import {
  MODEL_RIG_PATCH_MAX_OPS,
  ModelAnatomySchema,
  ModelClipOpSchema,
  ModelFacingSchema,
  ModelRigOpSchema,
} from './media-model-rig';

/**
 * The name Midnite Studio's MCP server registers under — what a client's config
 * keys it by and what Claude Code prefixes every tool with (`mcp__midnite__<tool>`).
 * One constant for the shim's `Server` and for every allowlist the app builds, so
 * the two cannot drift apart (a tool allowlisted under another name is silently
 * denied). Renamed from `midnite-studio` in the CLI/MCP rename.
 */
export const MCP_SERVER_NAME = 'midnite';

/** Camera angles a preview can be rendered from. */
export const MODEL_PREVIEW_VIEWS = ['front', 'side', 'top', 'iso'] as const;
export const ModelPreviewViewSchema = z.enum(MODEL_PREVIEW_VIEWS);
export type ModelPreviewView = z.infer<typeof ModelPreviewViewSchema>;

/** Pixel edge of one rendered view — bounded so a response stays small and a render stays fast. */
export const MODEL_PREVIEW_SIZE_MIN = 128;
export const MODEL_PREVIEW_SIZE_DEFAULT = 384;
export const MODEL_PREVIEW_SIZE_MAX = 768;

/** Most ops one `model_patch_parts` call may carry. */
export const MODEL_PATCH_MAX_OPS = 64;

/** Ids of the tools, in the order an agent meets them. */
export const MODEL_MCP_TOOL_IDS = [
  'model_list',
  'model_open',
  'model_get_spec',
  'model_set_spec',
  'model_patch_parts',
  'model_render_preview',
  'model_get_reference_image',
  'model_set_reference_views',
  'model_compare_reference',
  'model_get_rig',
  'model_auto_rig',
  'model_patch_rig',
  'model_patch_animations',
  'model_retarget',
  'model_convert_to_mesh',
  'model_sdf_set',
  'model_sdf_patch',
  'model_sdf_bake',
  'model_get_landmarks',
  'model_sculpt_stroke',
  'model_mask',
  'model_subdivide',
  'model_remesh',
  'model_sculpt_undo',
  'model_decimate',
  'model_retopo',
  'model_unwrap',
  'model_bake',
  'model_export',
  'model_layer_list',
  'model_material_set',
  'model_layer_add',
  'model_layer_update',
  'model_layer_remove',
  'model_paint_stroke',
  'model_save',
] as const;
export type ModelMcpToolId = (typeof MODEL_MCP_TOOL_IDS)[number];
export const isModelMcpToolId = (value: string): value is ModelMcpToolId =>
  (MODEL_MCP_TOOL_IDS as readonly string[]).includes(value);

/** Tools that change a model or the window — gated by `Settings ▸ MCP ▸ Let agents edit 3D models`. */
export const MODEL_MCP_WRITE_TOOL_IDS: readonly ModelMcpToolId[] = [
  'model_open',
  'model_set_spec',
  'model_patch_parts',
  'model_set_reference_views',
  'model_auto_rig',
  'model_patch_rig',
  'model_patch_animations',
  'model_retarget',
  'model_convert_to_mesh',
  'model_sdf_set',
  'model_sdf_patch',
  'model_sdf_bake',
  'model_sculpt_stroke',
  'model_mask',
  'model_subdivide',
  'model_remesh',
  'model_sculpt_undo',
  'model_decimate',
  'model_retopo',
  'model_unwrap',
  'model_bake',
  'model_export',
  'model_material_set',
  'model_layer_add',
  'model_layer_update',
  'model_layer_remove',
  'model_paint_stroke',
  'model_save',
];

/**
 * SF3D over MCP (Phase 103 Theme J). Deliberately *not* in `MODEL_MCP_TOOL_IDS`: those are the
 * design-editing tools an in-app iterative run is handed, and SF3D is a separate engine that needs
 * the user's own licence consent and install first — an agent can ask for a generation, never
 * install. `model_generate_sf3d` starts a run and returns at once (a CPU run outlasts the shim's
 * 60 s call timeout); `model_sf3d_status` reports the install and that run's progress.
 */
/** The SF3D tools — `model_*` by name, but outside the iterative design loop's `MODEL_MCP_TOOL_IDS`. */
export const SF3D_MCP_TOOL_IDS = ['model_sf3d_status', 'model_generate_sf3d'] as const;

export const ModelSf3dStatusInputSchema = z.object({
  /** A `model_generate_sf3d` run to report on. */
  generationId: z.string().min(1).max(200).optional(),
});
export const ModelSf3dStatusResultSchema = z.object({
  state: z.enum(SF3D_STATES),
  installed: z.boolean(),
  consentCurrent: z.boolean(),
  licence: z.object({ name: z.string(), url: z.string(), revenueLimitUsd: z.number() }),
  downloadBytes: z.number(),
  bytesOnDisk: z.number(),
  /** What to tell the user when SF3D is not ready. */
  hint: z.string().optional(),
  generation: z
    .object({
      generationId: z.string(),
      project: z.string(),
      status: z.enum(['running', 'succeeded', 'failed', 'cancelled']),
      stage: z.enum(SF3D_GENERATE_STAGES).optional(),
      fraction: z.number().optional(),
      error: z.string().optional(),
      /**
       * Project-relative model, once it succeeded — a design with one imported `asset` part, so it takes
       * `model_open`, `model_auto_rig`, `model_patch_animations` and every other `model_*` tool as it is.
       */
      primary: z.string().optional(),
    })
    .optional(),
});
export const ModelGenerateSf3dInputSchema = z.object({
  repoPath: z.string().min(1),
  project: MediaProjectNameSchema,
  /** A PNG/JPEG/WebP of one object — absolute, or relative to `repoPath`; must sit inside the repository. A transparent background works best. */
  imagePath: z.string().min(1).max(1024),
  name: z.string().trim().min(1).max(80).optional(),
  textureSize: z.union([z.literal(512), z.literal(1024), z.literal(2048)]).optional(),
});
export const ModelGenerateSf3dResultSchema = z.object({ started: z.literal(true), generationId: z.string() });

/** The exact refusal the write tools answer with while `McpSettings.allowModels` is off. */
export const MODELS_OFF_MESSAGE = 'Model editing is off — Settings ▸ MCP ▸ Let agents edit 3D models';

/** Which model a call is about: a repository by path, a Models project, and a file in it. */
export const ModelToolTargetSchema = z.object({
  repoPath: z.string().min(1),
  project: MediaProjectNameSchema,
  /** Project-relative path of any file of the model (`chair-20260101-120000.obj`); `model_list` returns them. */
  model: z.string().min(1).max(512),
});

const OpenRecord = z.record(z.string(), z.unknown());

export const ModelPatchOpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add'),
    /** A full part, as `model_get_spec`'s schema describes. */
    part: OpenRecord,
    /** Insert position; appended when absent. */
    index: z.number().int().min(0).optional(),
  }),
  z.object({
    op: z.literal('update'),
    id: z.string().min(1),
    /** Any part fields to change, merged over the existing part; `null` clears a field back to its default. */
    fields: OpenRecord,
  }),
  z.object({ op: z.literal('remove'), id: z.string().min(1) }),
]);
export type ModelPatchOp = z.infer<typeof ModelPatchOpSchema>;

export const ModelListInputSchema = z.object({
  repoPath: z.string().min(1),
  project: MediaProjectNameSchema.optional(),
});
export const ModelSetSpecInputSchema = ModelToolTargetSchema.extend({
  /** The whole design. Fetch the schema with `model_get_spec` first. */
  spec: OpenRecord,
});
export const ModelPatchPartsInputSchema = ModelToolTargetSchema.extend({
  ops: z.array(ModelPatchOpSchema).min(1).max(MODEL_PATCH_MAX_OPS),
});
export const ModelRenderPreviewInputSchema = ModelToolTargetSchema.extend({
  views: z.array(ModelPreviewViewSchema).min(1).max(MODEL_PREVIEW_VIEWS.length).optional(),
  size: z.number().int().min(MODEL_PREVIEW_SIZE_MIN).max(MODEL_PREVIEW_SIZE_MAX).optional(),
  /** Render the rigged model posed: a clip by name, at `time` seconds into it. */
  pose: z.object({ clip: z.string().min(1).max(40), time: z.number().finite().min(0).max(60) }).optional(),
});

export const ModelAutoRigInputSchema = ModelToolTargetSchema.extend({
  /** `static` removes the rig and the clips. */
  anatomy: ModelAnatomySchema,
  /** Which way the model faces; guessed from its shape when absent. */
  facing: ModelFacingSchema.optional(),
});
export const ModelPatchRigInputSchema = ModelToolTargetSchema.extend({
  ops: z.array(ModelRigOpSchema).min(1).max(MODEL_RIG_PATCH_MAX_OPS),
});
export const ModelPatchAnimationsInputSchema = ModelToolTargetSchema.extend({
  ops: z.array(ModelClipOpSchema).min(1).max(MODEL_RIG_PATCH_MAX_OPS),
});
export const ModelRetargetInputSchema = ModelToolTargetSchema.extend({
  /** The model to copy clips from — same repository; `project` defaults to this model's. */
  from: z.object({ project: MediaProjectNameSchema.optional(), model: z.string().min(1).max(512) }),
  /** Replace clips of the same name instead of adding `<name> 2`. */
  replace: z.boolean().optional(),
});

/** Most voxels' worth of detail a conversion may ask for: about this many vertices on the new surface. */
export const MODEL_CONVERT_MAX_VERTICES = 1_000_000;
export const ModelConvertToMeshInputSchema = ModelToolTargetSchema.extend({
  /** Part ids or names to convert (a group takes its descendants); omitted converts every visible part. */
  parts: z.array(z.string().min(1).max(60)).min(1).max(64).optional(),
  /** Voxel edge in model units — wins over `targetVertices`. */
  voxelSize: z.number().finite().min(0.0001).max(10).optional(),
  /** About how many vertices the new surface should have (default 20 000). */
  targetVertices: z.number().int().min(100).max(MODEL_CONVERT_MAX_VERTICES).optional(),
});

/**
 * SDF modelling over MCP (Phase 104 Theme C). Trees and edits arrive as open records and main validates
 * them against `SdfTreeSchema`/`SdfOpSchema` (`media-model-sdf.ts`), so a bad node comes back as a
 * result with a path, not a protocol error.
 */
const SdfPartRef = z.string().min(1).max(60);
const SdfResolutionInput = z.number().int().min(SDF_RESOLUTION_MIN).max(SDF_RESOLUTION_MAX);
export const ModelSdfSetInputSchema = ModelToolTargetSchema.extend({
  /** `{ nodes: [...], blend? }` — the roots are unioned (smoothly, by `blend`). */
  tree: z.object({ nodes: z.array(z.record(z.unknown())).min(1).max(32), blend: z.number().optional() }).passthrough(),
  /** An SDF part (id or name) to replace; omitted adds a new part. */
  part: SdfPartRef.optional(),
  /** Name for a new part (default "sdf shape"). */
  name: z.string().min(1).max(60).optional(),
  /** Grid resolution along the longest side (default 96). */
  resolution: SdfResolutionInput.optional(),
});
export const ModelSdfPatchInputSchema = ModelToolTargetSchema.extend({
  /** The SDF part (id or name); may be omitted when the design has exactly one. */
  part: SdfPartRef.optional(),
  /** `add`/`update`/`remove`/`move`/`wrap` nodes by name, or `blend` the roots — applied in order, all or nothing. */
  ops: z.array(z.record(z.unknown())).min(1).max(64),
  /** Re-bake at this resolution (default: the part's last). */
  resolution: SdfResolutionInput.optional(),
});
export const ModelSdfBakeInputSchema = ModelToolTargetSchema.extend({
  part: SdfPartRef.optional(),
  resolution: SdfResolutionInput,
});


/**
 * Sculpting over MCP (Phase 104 Theme E). A stroke names a brush and *where* — pixels on a preview the agent
 * looked at, a rig bone, a landmark, a vertex group, world points, or the open area of the mask
 * (`ModelSculptTargetSchema`, `model-geometry/sculpt/aim.ts`); the kernel resolves it against the live mesh.
 * Radius, strength, falloff and symmetry are the editor's own. Write tools, like every `model_*` one, answer a
 * validation failure as a result, never an exception.
 */
const SculptPartRef = z.string().min(1).max(60);
export const MODEL_SCULPT_PREVIEW_SIZE_MIN = 128;
export const MODEL_SCULPT_PREVIEW_SIZE_MAX = 384;
export const MODEL_SCULPT_UNDO_MAX = 50;
export const ModelSculptStrokeInputSchema = ModelToolTargetSchema.extend({
  /** The sculpt part (id or name); may be omitted when the design has exactly one. */
  part: SculptPartRef.optional(),
  brush: z.enum(SCULPT_BRUSHES),
  /** Where to stroke; exactly one `mode`. */
  target: ModelSculptTargetSchema,
  /** Dab radius in metres (default 6% of the mesh's diagonal); a screen target may give `radiusPixels` instead. */
  radius: z.number().finite().positive().max(100).optional(),
  /** 0–1 (default 0.5). */
  strength: z.number().min(0).max(1).optional(),
  falloff: z.enum(SCULPT_FALLOFFS).optional(),
  /** Distance between dabs as a fraction of the radius (default 0.1). */
  spacing: z.number().min(0.02).max(2).optional(),
  /** The brush's opposite: carve instead of build, deflate, unmask. */
  invert: z.boolean().optional(),
  /** Leave surface facing away from the aim alone (default true for a screen target). */
  frontFacesOnly: z.boolean().optional(),
  symmetry: SculptSymmetrySchema.partial().optional(),
  /** The thumbnail returned with the result: which view and how big; `false` for none. */
  preview: z
    .union([
      z.literal(false),
      z.object({ view: AimViewSchema.optional(), size: z.number().int().min(MODEL_SCULPT_PREVIEW_SIZE_MIN).max(MODEL_SCULPT_PREVIEW_SIZE_MAX).optional() }),
    ])
    .optional(),
});
export const ModelMaskInputSchema = ModelToolTargetSchema.extend({
  part: SculptPartRef.optional(),
  /** `set` masks the `region` or `lasso` (or unmasks it, with `value: 0`); `grow`/`shrink` resize the masked area; `invert`/`clear` act on all of it. */
  op: z.enum(['set', 'grow', 'shrink', 'invert', 'clear']),
  region: z
    .object({
      bone: z.string().min(1).max(40).optional(),
      landmark: z.string().min(1).max(40).optional(),
      group: z.string().min(1).max(60).optional(),
      part: z.string().min(1).max(60).optional(),
      /** Metres around a landmark (default 6% of the diagonal). */
      radius: z.number().finite().positive().max(100).optional(),
    })
    .optional(),
  /** Screen-space polygon on a preview view, as pixels; masks the surface it can see. */
  lasso: z.object({ view: AimViewSchema, points: z.array(z.tuple([z.number().finite(), z.number().finite()])).min(3).max(AIM_MAX_POINTS), size: z.number().int().min(64).max(768).optional() }).optional(),
  /** 1 masks (default), 0 unmasks. */
  value: z.union([z.literal(0), z.literal(1)]).optional(),
  /** Rings to grow or shrink by (default 1). */
  steps: z.number().int().min(1).max(16).optional(),
});
export const ModelSubdivideInputSchema = ModelToolTargetSchema.extend({
  part: SculptPartRef.optional(),
  /** Loop-subdivision levels to add (default 1; each quadruples the faces). */
  levels: z.number().int().min(1).max(3).optional(),
});
export const ModelRemeshInputSchema = ModelToolTargetSchema.extend({
  part: SculptPartRef.optional(),
  voxelSize: z.number().finite().min(0.0001).max(10).optional(),
  targetVertices: z.number().int().min(100).max(MODEL_CONVERT_MAX_VERTICES).optional(),
});
export const ModelSculptUndoInputSchema = ModelToolTargetSchema.extend({
  part: SculptPartRef.optional(),
  /** How many sculpt edits to step back (or forward, with `redo`); default 1. */
  steps: z.number().int().min(1).max(MODEL_SCULPT_UNDO_MAX).optional(),
  redo: z.boolean().optional(),
});

/**
 * The mesh pipeline over MCP (Phase 104 Theme F): decimate and retopologise a dense sculpt into a low-poly
 * part (the original stays, hidden, as the bake source), unwrap it, bake maps from the original, and export.
 */
const MeshPartRef = SculptPartRef;
export const MODEL_DECIMATE_MIN_TRIANGLES = 8;
export const MODEL_RETOPO_MAX_FACES = 200_000;
export const ModelDecimateInputSchema = ModelToolTargetSchema.extend({
  part: MeshPartRef.optional(),
  /** Triangles to end with. */
  targetTriangles: z.number().int().min(MODEL_DECIMATE_MIN_TRIANGLES).max(2_000_000).optional(),
  /** Fraction to keep (default 0.5 when neither is given). */
  ratio: z.number().min(0.005).max(0.99).optional(),
  /** Keep open edges and UV seams where they are (default true). */
  lockBorders: z.boolean().optional(),
  /** Overwrite the part instead of adding a low-poly copy and hiding the original. */
  replace: z.boolean().optional(),
  name: z.string().trim().min(1).max(60).optional(),
});
export const ModelRetopoInputSchema = ModelToolTargetSchema.extend({
  part: MeshPartRef.optional(),
  targetFaces: z.number().int().min(100).max(MODEL_RETOPO_MAX_FACES),
  replace: z.boolean().optional(),
  name: z.string().trim().min(1).max(60).optional(),
});
export const ModelUnwrapInputSchema = ModelToolTargetSchema.extend({
  part: MeshPartRef.optional(),
  /** Largest angle (degrees) a face may lean from its chart's mean normal (default 70). */
  angle: z.number().min(10).max(90).optional(),
  /** Largest fold (degrees) a chart may grow across — the curvature seam (default 55). */
  curvature: z.number().min(10).max(90).optional(),
  /** Texture edge the density readout and gutters assume (default 2048). */
  textureSize: z.number().int().min(256).max(BAKE_SIZE_MAX).optional(),
  /** Drop the part's unwrap and baked maps, welding the seams back, so it can be sculpted again. */
  clear: z.boolean().optional(),
});
export const ModelBakeInputSchema = ModelToolTargetSchema.extend({
  /** The unwrapped low-poly part to bake onto. */
  part: MeshPartRef.optional(),
  /** The high-resolution sculpt part to bake from; default the one `model_decimate`/`model_retopo` hid. */
  from: MeshPartRef.optional(),
  /** Which maps (default all four). */
  maps: z.array(z.enum(BAKE_KINDS as readonly [string, ...string[]])).min(1).max(4).optional(),
  /** Texture edge in texels (default 2048, up to 4096). */
  size: z.number().int().min(BAKE_SIZE_MIN).max(BAKE_SIZE_MAX).optional(),
  /** Occlusion rays per texel (default 12). */
  aoSamples: z.number().int().min(1).max(64).optional(),
  /** How far outside the low surface rays start, in metres (default 3% of its diagonal). */
  cage: z.number().finite().positive().max(100).optional(),
});
export const MODEL_MESH_EXPORT_FORMATS = ['glb', 'obj', 'fbx'] as const;
export const ModelExportInputSchema = ModelToolTargetSchema.extend({
  /** Which files to write beside the design (default all three): `.glb` carries PBR, skin, clips and baked maps. */
  formats: z.array(z.enum(MODEL_MESH_EXPORT_FORMATS)).min(1).max(3).optional(),
});

/** One landmark: a name and a position in model space. */
/**
 * PBR materials and texture painting over MCP (Phase 104 Theme G). A painted sculpt part has a layer stack
 * (`media-model-pbr.ts`); these tools set its base material or a preset, add, change and remove layers, and paint
 * a paint layer with a brush aimed exactly like `model_sculpt_stroke`. Every write flattens the stack into the
 * glTF texture set beside the design. The part must be unwrapped (`model_unwrap`).
 */
const LayerRef = z.string().min(1).max(60);
const pbrSize = z.number().int().min(PBR_SIZE_MIN).max(PBR_SIZE_MAX);
export const ModelMaterialSetInputSchema = ModelToolTargetSchema.extend({
  part: SculptPartRef.optional(),
  /** Replace the stack with a preset's layers (and set the part's colour and material from it). */
  preset: z.enum(PBR_PRESETS).optional(),
  /** With `preset`: keep the existing paint layers on top. */
  keepPaint: z.boolean().optional(),
  /** The base surface under every layer. */
  color: ModelColorSchema.optional(),
  roughness: z.number().min(0).max(1).optional(),
  metalness: z.number().min(0).max(1).optional(),
  emissive: ModelColorSchema.optional(),
  emissiveIntensity: z.number().min(0).max(10).optional(),
  /** Texture edge for every channel, or per channel. */
  size: pbrSize.optional(),
  sizes: z.object(Object.fromEntries(PBR_CHANNELS.map((c) => [c, pbrSize.optional()])) as Record<(typeof PBR_CHANNELS)[number], z.ZodOptional<typeof pbrSize>>).optional(),
  /** Drop the whole layer stack and its textures. */
  clear: z.boolean().optional(),
});
export const ModelLayerAddInputSchema = ModelToolTargetSchema.extend({
  part: SculptPartRef.optional(),
  /** `fill`: constant channel values (with `fill`); `paint`: pixels painted by `model_paint_stroke`. */
  kind: z.enum(['fill', 'paint']),
  name: z.string().trim().min(1).max(60).optional(),
  fill: PbrFillSchema.optional(),
  mask: PbrLayerMaskSchema.optional(),
  blend: z.enum(PAINT_BLEND_MODES).optional(),
  opacity: z.number().min(0).max(1).optional(),
  /** Position in the stack, 0 = bottom (default: on top). */
  index: z.number().int().min(0).max(64).optional(),
});
export const ModelLayerUpdateInputSchema = ModelToolTargetSchema.extend({
  part: SculptPartRef.optional(),
  /** The layer's id or unique name. */
  layer: LayerRef,
  name: z.string().trim().min(1).max(60).optional(),
  hidden: z.boolean().optional(),
  opacity: z.number().min(0).max(1).optional(),
  blend: z.enum(PAINT_BLEND_MODES).optional(),
  /** Merged into the fill; `null` removes a value. */
  fill: z
    .object({
      albedo: ModelColorSchema.nullable().optional(),
      roughness: z.number().min(0).max(1).nullable().optional(),
      metalness: z.number().min(0).max(1).nullable().optional(),
      ao: z.number().min(0).max(1).nullable().optional(),
      emissive: ModelColorSchema.nullable().optional(),
      noise: PbrNoiseSchema.nullable().optional(),
    })
    .optional(),
  /** Replaces the mask; `null` removes it. */
  mask: PbrLayerMaskSchema.nullable().optional(),
  /** Move to this position (0 = bottom). */
  index: z.number().int().min(0).max(64).optional(),
});
export const ModelLayerRemoveInputSchema = ModelToolTargetSchema.extend({ part: SculptPartRef.optional(), layer: LayerRef });
/** `model_set_reference_views`: register the reference picture to the model, by hand (`views`) or by fitting (`fit`). */
export const ModelSetReferenceViewsInputSchema = ModelToolTargetSchema.extend({
  /** Matched views to save, replacing the design's own. */
  views: ReferenceViewsSchema.optional(),
  /** Or: segment the picture for `view` and fit it to a model `height` m tall standing on `bottom` (default 0). */
  fit: z
    .object({
      view: ReferenceViewNameSchema,
      height: z.number().positive().max(10_000),
      bottom: z.number().min(-10_000).max(10_000).optional(),
      /** A picture beside the design; default its reference picture. */
      image: z.string().min(1).max(200).optional(),
    })
    .optional(),
  /** Remove the matched views. */
  clear: z.boolean().optional(),
});

/** `model_compare_reference`: score the model against the matched views and draw the overlay. */
export const ModelCompareReferenceInputSchema = ModelToolTargetSchema.extend({
  /** Only these views; default every matched view. */
  views: z.array(ReferenceViewNameSchema).min(1).max(3).optional(),
  /** Passes the run may spend in total (the refinement slider); with it the answer plans the next pass. */
  budget: z.number().int().min(1).max(100).optional(),
  /** Forget the score history of earlier comparisons (a fresh start). */
  reset: z.boolean().optional(),
  /** Per-region width tolerance as a fraction, default 0.12. */
  tolerance: z.number().min(0.02).max(0.5).optional(),
  /** Segmentation threshold (colour distance from the background), default 48. */
  threshold: z.number().min(4).max(300).optional(),
  /** Return the overlay images (default true). */
  overlay: z.boolean().optional(),
});

export const ModelLayerListInputSchema = ModelToolTargetSchema.extend({ part: SculptPartRef.optional() });
export const ModelPaintStrokeInputSchema = ModelToolTargetSchema.extend({
  part: SculptPartRef.optional(),
  /** A paint layer (id or name); default the top paint layer, made when there is none. */
  layer: LayerRef.optional(),
  /** What to paint (default `albedo`); `mask` paints the layer's own mask. */
  channel: z.enum(PAINT_TARGETS).optional(),
  brush: z.enum(PAINT_BRUSHES),
  /** Colour for `albedo`/`emissive` (default white). */
  color: ModelColorSchema.optional(),
  /** 0–1 for `roughness`/`metalness`/`ao`/`mask` (default 1). */
  value: z.number().min(0).max(1).optional(),
  /** Tangent-space direction for `normal` (x right, y up, z out; default `[0, 0, 1]`). */
  normal: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]).optional(),
  /** Where to paint; the same target forms as `model_sculpt_stroke`. */
  target: ModelSculptTargetSchema,
  /** Dab radius in metres (default 6% of the mesh's diagonal); a screen target may give `radiusPixels`. */
  radius: z.number().finite().positive().max(100).optional(),
  /** 0–1 (default 1). */
  strength: z.number().min(0).max(1).optional(),
  falloff: z.enum(SCULPT_FALLOFFS).optional(),
  spacing: z.number().min(0.02).max(2).optional(),
  frontFacesOnly: z.boolean().optional(),
  /** Clone: copy from this offset (metres) away on the surface. */
  cloneOffset: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]).optional(),
  /** Stamp: a built-in alpha, or a PNG in the model folder. */
  stamp: z.union([z.enum(STAMP_PATTERNS), z.object({ image: ModelMapSrcSchema })]).optional(),
  stampAngle: z.number().finite().min(-360).max(360).optional(),
  preview: z
    .union([
      z.literal(false),
      z.object({ view: AimViewSchema.optional(), size: z.number().int().min(MODEL_SCULPT_PREVIEW_SIZE_MIN).max(MODEL_SCULPT_PREVIEW_SIZE_MAX).optional() }),
    ])
    .optional(),
});
const LayerSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['fill', 'paint']),
  hidden: z.boolean().optional(),
  opacity: z.number(),
  blend: z.string(),
  /** Channels it touches (a fill's values, a paint layer's painted channels). */
  channels: z.array(z.string()),
  mask: z.string().optional(),
});
/** `model_layer_list` answer. */
export const ModelLayerListResultSchema = z.object({
  part: z.string(),
  unwrapped: z.boolean(),
  preset: z.string().optional(),
  base: z.object({ color: z.string(), roughness: z.number(), metalness: z.number(), emissive: z.string() }),
  sizes: z.record(z.number()),
  /** Bottom → top. */
  layers: z.array(LayerSummarySchema),
  /** Theme F bakes a mask can use. */
  bakes: z.array(z.string()),
  flattened: z.record(z.string()),
});

export const ModelLandmarksResultSchema = z.object({
  facing: z.string(),
  landmarks: z.array(z.object({ name: z.string(), position: z.tuple([z.number(), z.number(), z.number()]), source: z.enum(['auto', 'user']) })),
});

/** `model_get_rig` answer: the rig as the kernel resolves it, the anatomy's table and what is wrong. */
export const ModelGetRigResultSchema = z.object({
  anatomy: ModelAnatomySchema,
  facing: ModelFacingSchema.nullable(),
  falloff: z.number().nullable(),
  bones: z.array(z.object({ name: z.string(), parent: z.string().nullable(), head: z.array(z.number()), tail: z.array(z.number()) })),
  /** Every built part and the bone it moves with (`bound` = set by hand, not chosen automatically). */
  bindings: z.array(z.object({ part: z.string(), bone: z.string(), bound: z.boolean() })),
  animations: z.array(z.unknown()),
  table: z.array(z.object({ name: z.string(), parent: z.string().nullable(), required: z.boolean() })),
  clipKinds: z.array(z.string()),
  issues: z.array(z.object({ path: z.string(), message: z.string() })),
});

/** One problem with a design or an op — a path into it and a sentence a model can act on. */
export const ModelToolIssueSchema = z.object({
  /** Index into the call's `ops`, when the problem is in one. */
  opIndex: z.number().int().min(0).optional(),
  path: z.string(),
  message: z.string(),
});
export type ModelToolIssue = z.infer<typeof ModelToolIssueSchema>;

const Vec3Out = z.tuple([z.number(), z.number(), z.number()]);

/** `model_set_spec` / `model_patch_parts` answer: applied, or the structured reasons nothing changed. */
export const ModelEditResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    /** The model's file, as every other tool takes it — new when `model_set_spec` created one. */
    model: z.string(),
    revision: z.number().int().min(0),
    partCount: z.number().int().min(0),
    parts: z.array(z.object({ id: z.string(), name: z.string(), shape: z.string() })),
    bounds: z.object({ min: Vec3Out, max: Vec3Out, size: Vec3Out }),
    /** Triangles in the built model — a budget the agent can watch as it adds detail. */
    triangles: z.number().int().min(0).optional(),
    /** Non-fatal build problems (a boolean that failed, a modifier stopped at the triangle cap) — the edit was applied. */
    warnings: z.array(ModelToolIssueSchema).optional(),
    /** A rigged design's anatomy, bone count and clip names. */
    rig: z.object({ anatomy: z.string(), bones: z.number().int().min(0), clips: z.array(z.string()) }).optional(),
    /** `model_set_reference_views`: the matched views now saved on the design. */
    referenceViews: ReferenceViewsSchema.optional(),
    /** Clips `model_retarget` could not copy (a kind this anatomy has no use for). */
    skipped: z.array(z.string()).optional(),
    /** `model_convert_to_mesh`: the sculpt part that now stands in for the converted primitives. */
    converted: z
      .object({
        id: z.string(),
        src: z.string(),
        vertices: z.number().int().min(0),
        triangles: z.number().int().min(0),
        voxelSize: z.number(),
        /** Ids of the primitives that were hidden (recoverable by un-hiding them or removing the sculpt part). */
        sources: z.array(z.string()),
        groups: z.array(z.string()),
      })
      .optional(),
    /** `model_sculpt_*`, `model_mask`, `model_subdivide`, `model_remesh`: the sculpt part after the edit. */
    sculpt: z
      .object({
        part: z.string(),
        vertices: z.number().int().min(0),
        triangles: z.number().int().min(0),
        level: z.number().int().min(0),
        /** Sculpt edits so far this session; `model_sculpt_undo` walks it. */
        revision: z.number().int().min(0),
        undoable: z.number().int().min(0),
        redoable: z.number().int().min(0),
        /** What the call did, in numbers: dabs, vertices moved, the largest move in metres, masked vertices… */
        summary: z.record(z.union([z.number(), z.string(), z.boolean()])),
      })
      .optional(),
    /** `model_decimate`/`retopo`/`unwrap`/`bake`/`export`: the part it produced and the numbers. */
    pipeline: z
      .object({
        op: z.string(),
        part: z.string(),
        vertices: z.number().int().min(0),
        triangles: z.number().int().min(0),
        /** Per-op figures: reached target, quad share, texel density, hit rate, files written… */
        summary: z.record(z.union([z.number(), z.string(), z.boolean(), z.array(z.string())])),
        /** A rigged model: the skeleton is kept and the skin re-derived and checked against the old surface. */
        rig: z.object({ kept: z.boolean(), normalised: z.boolean(), influences: z.number().int(), drift: z.object({ mean: z.number(), max: z.number() }) }).optional(),
      })
      .optional(),
    /** `model_material_set`/`model_layer_*`/`model_paint_stroke`: the part's stack after the call. */
    material: z
      .object({
        part: z.string(),
        layers: z.array(LayerSummarySchema),
        /** Texture files written (layer channels and the flattened set). */
        files: z.array(z.string()),
        summary: z.record(z.union([z.number(), z.string(), z.boolean()])),
      })
      .optional(),
    /** `model_sdf_*`: the SDF part that holds the bake, and how it went. */
    sdf: z
      .object({
        id: z.string(),
        src: z.string(),
        vertices: z.number().int().min(0),
        triangles: z.number().int().min(0),
        resolution: z.number().int(),
        voxelSize: z.number(),
        /** Node names, depth first — what `model_sdf_patch` addresses. */
        nodes: z.array(z.string()),
        /** Share of grid nodes the bake actually evaluated (the rest were pruned as far from the surface). */
        evaluatedShare: z.number(),
      })
      .optional(),
  }),
  z.object({ ok: z.literal(false), errors: z.array(ModelToolIssueSchema) }),
]);
export type ModelEditResult = z.infer<typeof ModelEditResultSchema>;

/**
 * Tool results that carry pictures: main answers `{ [MCP_CONTENT_KEY]: [...] }` and the stdio shim
 * hands those blocks to the client as-is, so a multimodal agent sees real images rather than base64 text.
 */
export const MCP_CONTENT_KEY = '_content';
export const McpContentBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('image'), data: z.string(), mimeType: z.string() }),
]);
export type McpContentBlock = z.infer<typeof McpContentBlockSchema>;
export const McpContentResultSchema = z.object({ [MCP_CONTENT_KEY]: z.array(McpContentBlockSchema) });

// --- live UI events ------------------------------------------------------------

/** Pushed on `mstudio:media:model-changed` whenever an agent (in-app run or an MCP session) edits a model. */
export const ModelChangedEventSchema = z.object({
  repoId: z.string().min(1),
  project: MediaProjectNameSchema,
  /** The `.obj` path the Models tab lists the model under. */
  path: z.string().min(1),
  /** The design as it is now — the open editor adopts it as it arrives. */
  spec: ModelSpecSchema,
  /** `true` once the `.obj`/`.fbx` trio matches `spec` (after `model_save`), so the editor is not dirty. */
  saved: z.boolean(),
  revision: z.number().int().min(0),
});
export type ModelChangedEvent = z.infer<typeof ModelChangedEventSchema>;

/** Pushed on `mstudio:media:model-open` — `model_open` asks the window to show a model. */
export const ModelOpenEventSchema = z.object({
  repoId: z.string().min(1),
  project: MediaProjectNameSchema,
  path: z.string().min(1),
});
export type ModelOpenEvent = z.infer<typeof ModelOpenEventSchema>;
