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
 * `claude mcp add midnite-studio -- node <shim path from Settings ▸ MCP>`.
 */
import { z } from 'zod';

import { MediaProjectNameSchema } from './media';
import { ModelSpecSchema } from './media-model';

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
  'model_save',
];

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
