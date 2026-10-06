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
import { ModelSpecSchema } from './media-model';
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
  'model_get_rig',
  'model_auto_rig',
  'model_patch_rig',
  'model_patch_animations',
  'model_retarget',
  'model_convert_to_mesh',
  'model_sdf_set',
  'model_sdf_patch',
  'model_sdf_bake',
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
  'model_auto_rig',
  'model_patch_rig',
  'model_patch_animations',
  'model_retarget',
  'model_convert_to_mesh',
  'model_sdf_set',
  'model_sdf_patch',
  'model_sdf_bake',
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
