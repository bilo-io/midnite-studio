/**
 * Media ▸ Sprites over MCP (Phase 106 Theme K) — the tools an agent uses to make 2D game assets: pick a
 * method, generate a sheet (or a tileset, a background, a map) as an asynchronous job, poll it, read the
 * badges, re-roll the bad frames, look at the motion, export. Registered in `MCP_TOOLS` (`mcp.ts`).
 *
 * **Generation is a job, never a blocking call** (Decision 10). `sprite_generate`,
 * `sprite_regenerate_frames`, `tileset_generate`, `background_generate` and `map_generate` answer
 * `{ jobId }` at once; `sprite_job_status` reports it and `sprite_cancel` stops it. An 8-direction sheet
 * is hundreds of requests and twenty minutes — no shim timeout and no agent turn survives that.
 *
 * **Spend is capped.** One MCP job may make at most {@link SPRITE_MCP_MAX_REQUESTS} provider requests,
 * re-rolls included; a job whose worst case is larger is refused before it starts, with the count.
 *
 * **The spec is `SpriteAssetSpecSchema`.** `sprite_set_spec` takes a partial spec as an open record and
 * main validates it against the live schema, so a new field reaches the agent — through
 * `sprite_get_spec`'s derived schema — without this file changing.
 *
 * **Connecting a session of your own.** Enable Settings ▸ MCP, turn on "Let agents edit sprites and
 * maps", then `claude mcp add midnite -- node <shim path from Settings ▸ MCP>`.
 */
import { z } from 'zod';

import { ModelLibraryNameSchema } from './media-model-library';
import {
  MAP_OBJECT_TYPES,
  SPRITE_METHODS,
  SpriteExportResultSchema,
  SpriteFrameKeySchema,
  SpriteGroupIdSchema,
  SpriteJobStatusSchema,
  SpritePackOptionsSchema,
  SpritePatchOpSchema,
  SPRITE_MAP_MAX_REPAIRS,
  SPRITE_PATCH_MAX_OPS,
  spriteDirections,
  type SpriteAssetSpec,
} from './media-sprite';

/** Ids of the tools, in the order an agent meets them. Environments keep their own prefixes for discoverability. */
export const SPRITE_MCP_TOOL_IDS = [
  'sprite_list',
  'sprite_open',
  'sprite_get_spec',
  'sprite_set_spec',
  'sprite_recommend_method',
  'sprite_generate',
  'sprite_regenerate_frames',
  'sprite_patch_frames',
  'sprite_render_preview',
  'sprite_get_report',
  'sprite_job_status',
  'sprite_cancel',
  'tileset_generate',
  'background_generate',
  'map_generate',
  'map_get',
  'map_patch',
  'sprite_export',
] as const;
export type SpriteMcpToolId = (typeof SPRITE_MCP_TOOL_IDS)[number];
export const isSpriteMcpToolId = (value: string): value is SpriteMcpToolId => (SPRITE_MCP_TOOL_IDS as readonly string[]).includes(value);

/** Tools that change an asset, start or stop a job, or write files — gated by `Settings ▸ MCP ▸ Let agents edit sprites and maps`. */
export const SPRITE_MCP_WRITE_TOOL_IDS: readonly SpriteMcpToolId[] = [
  'sprite_open',
  'sprite_set_spec',
  'sprite_generate',
  'sprite_regenerate_frames',
  'sprite_patch_frames',
  'tileset_generate',
  'background_generate',
  'map_generate',
  'map_patch',
  'sprite_export',
  'sprite_cancel',
];

/** Only the preview outlasts the shim's default timeout (it decodes and composes every frame); every job returns at once. */
export const SPRITE_SLOW_TOOL_IDS: readonly SpriteMcpToolId[] = ['sprite_render_preview'];
export const isSpriteSlowToolId = (value: string): boolean => (SPRITE_SLOW_TOOL_IDS as readonly string[]).includes(value);

/** The exact refusal the write tools answer with while `McpSettings.allowSprites` is off. */
export const SPRITES_OFF_MESSAGE = 'Sprite editing is off — Settings ▸ MCP ▸ Let agents edit sprites and maps';

/** Provider requests (image or LLM, re-rolls included) one MCP job may make at most. */
export const SPRITE_MCP_MAX_REQUESTS = 200;
export const spriteRequestCapMessage = (requests: number): string =>
  `This job could make up to ${requests} provider requests, over the ${SPRITE_MCP_MAX_REQUESTS} one MCP job may make. Generate fewer clips, directions or frames at a time.`;

/** Which asset a call is about: a repository by path, one of the five groups, and the asset's folder. */
export const SpriteToolTargetSchema = z.object({
  repoPath: z.string().min(1),
  group: SpriteGroupIdSchema,
  /** The asset's folder name (`hero-20261004-120000`); `sprite_list` returns it. */
  asset: ModelLibraryNameSchema,
});
export type SpriteToolTarget = z.infer<typeof SpriteToolTargetSchema>;

/**
 * An existing asset, or a new one: a `spec` (`{ kind, name, … }`) is created first and the job runs on it.
 * Exactly one of `asset` (with `group`) or `spec`.
 */
export const SpriteToolTargetOrSpecSchema = z.object({
  repoPath: z.string().min(1),
  group: SpriteGroupIdSchema.optional(),
  asset: ModelLibraryNameSchema.optional(),
  spec: z.record(z.string(), z.unknown()).optional(),
});

export const SpriteListInputSchema = z.object({ repoPath: z.string().min(1), group: SpriteGroupIdSchema.optional() });
export const SpriteListResultSchema = z.object({
  groups: z.array(
    z.object({
      group: SpriteGroupIdSchema,
      assets: z.array(z.object({ asset: z.string(), name: z.string(), kind: z.string(), built: z.boolean(), mtimeMs: z.number() })),
    }),
  ),
});

export const SpriteOpenResultSchema = z.object({ opened: z.literal(true), asset: z.string() });

export const SpriteGetSpecResultSchema = z.object({
  spec: z.record(z.string(), z.unknown()),
  /** JSON Schema of every kind's spec, so an agent learns the fields and limits from the tool itself. */
  schema: z.unknown(),
  hint: z.string(),
});

export const SpriteSetSpecInputSchema = SpriteToolTargetSchema.extend({
  /** A partial spec: top-level keys replace the stored ones whole. `kind`, `reference` and the timestamps are managed. */
  patch: z.record(z.string(), z.unknown()),
});
export const SpriteToolIssueSchema = z.object({ path: z.string(), message: z.string() });
export type SpriteToolIssue = z.infer<typeof SpriteToolIssueSchema>;
export const SpriteEditResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), asset: z.string(), spec: z.record(z.string(), z.unknown()) }),
  z.object({ ok: z.literal(false), errors: z.array(SpriteToolIssueSchema) }),
]);

export const SpriteRecommendInputSchema = z.object({
  repoPath: z.string().min(1),
  group: SpriteGroupIdSchema.optional(),
  asset: ModelLibraryNameSchema.optional(),
  /** A draft sheet spec, for a recommendation before anything is created. */
  spec: z.record(z.string(), z.unknown()).optional(),
});
export const SpriteRecommendResultSchema = z.object({ method: z.enum(SPRITE_METHODS), reason: z.string(), alternatives: z.array(z.string()) });

/** A job started: the asset it runs on (new when a `spec` was given) and the worst-case request count. */
export const SpriteJobStartedSchema = z.object({ jobId: z.string(), group: SpriteGroupIdSchema, asset: z.string(), requests: z.number().int().nonnegative(), hint: z.string() });

export const SpriteGenerateInputSchema = SpriteToolTargetOrSpecSchema.extend({
  /** Only these clips; absent: every clip. */
  clips: z.array(z.string().min(1)).max(32).optional(),
  /** Hand-drawn step 1: draw the turnaround reference instead of frames. */
  turnaround: z.boolean().optional(),
  /** Hand-drawn step 2: lock the drawn reference before drawing frames against it. */
  approveReference: z.boolean().optional(),
  /** Run this one job hand-drawn (a one-shot sheet's failing clip). */
  method: z.literal('hand-drawn').optional(),
});

export const SpriteRegenerateFramesInputSchema = SpriteToolTargetSchema.extend({
  /** Frame keys `<clip>/<dir>/<nnn>` — `sprite_get_report` lists the badged ones. */
  frames: z.array(SpriteFrameKeySchema).min(1).max(SPRITE_PATCH_MAX_OPS),
});

export const SpritePatchFramesInputSchema = SpriteToolTargetSchema.extend({ ops: z.array(SpritePatchOpSchema).min(1).max(SPRITE_PATCH_MAX_OPS) });
export const SpritePatchFramesOutputSchema = z.object({ applied: z.number().int().nonnegative(), jobId: z.string().optional() });

export const SpriteRenderPreviewInputSchema = SpriteToolTargetSchema.extend({
  /** Contact sheets for these clips only (sheets); absent: every clip. */
  clips: z.array(z.string().min(1)).max(32).optional(),
  /** The direction to show (sheets); absent: the first. */
  dir: z.string().min(1).max(2).optional(),
  /** Also one APNG of this clip, so the motion itself can be seen. */
  animate: z.string().min(1).optional(),
});

export const SpriteGetReportResultSchema = z.object({
  kind: z.string(),
  report: z.object({ frames: z.number(), failing: z.number(), at: z.string() }).nullable(),
  frames: z.number().int().nonnegative(),
  /** Frames with at least one badge, each with the rules that fired. */
  flagged: z.array(z.object({ key: z.string(), badges: z.array(z.string()), rules: z.array(z.string()), score: z.number().optional(), issues: z.array(z.string()).optional() })),
  hint: z.string(),
});

export const SpriteJobInputSchema = z.object({ jobId: z.string().min(1) });
export const SpriteJobStatusOutputSchema = SpriteJobStatusSchema;
export const SpriteCancelOutputSchema = z.object({ cancelled: z.literal(true) });

export const MapGenerateInputSchema = SpriteToolTargetOrSpecSchema.extend({
  /** Refill the stored layout instead of asking the engine for a new one. */
  keepLayout: z.boolean().optional(),
});

export const MapGetResultSchema = z.object({
  mapSpec: z.record(z.string(), z.unknown()).nullable(),
  tileset: z.string().nullable(),
  terrains: z.array(z.string()),
  built: z.boolean(),
  orientation: z.string().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  /** Each layer's size — never the tile arrays. */
  layers: z.array(z.object({ name: z.string(), type: z.string(), width: z.number().optional(), height: z.number().optional(), tiles: z.number().optional(), objects: z.number().optional() })),
});

/** One map edit. `set` paints one ground cell with a terrain; `object` adds or moves a named object; `refill` re-runs the fill. */
export const MapPatchOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set'), layer: z.literal('ground').default('ground'), x: z.number().int(), y: z.number().int(), terrain: z.string().min(1) }),
  z.object({ op: z.literal('object'), type: z.enum(MAP_OBJECT_TYPES), name: z.string().min(1).max(64), x: z.number().int(), y: z.number().int() }),
  z.object({ op: z.literal('refill') }),
]);
export type MapPatchOp = z.infer<typeof MapPatchOpSchema>;
export const MapPatchInputSchema = SpriteToolTargetSchema.extend({ ops: z.array(MapPatchOpSchema).min(1).max(256) });
export const MapPatchResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), applied: z.number().int(), layers: MapGetResultSchema.shape.layers }),
  z.object({ ok: z.literal(false), errors: z.array(SpriteToolIssueSchema) }),
]);

export const SpriteExportInputSchema = SpriteToolTargetSchema.extend({
  /** Repo-relative folder to also write `<name>.<kind>/` into; the asset's own `export/` is always written. An existing pack is never overwritten. */
  dest: z.string().min(1).max(1024).optional(),
  pack: SpritePackOptionsSchema.partial().optional(),
});
export const SpriteExportOutputSchema = SpriteExportResultSchema.extend({ relativePath: z.string().optional() });

/** Draws per environment image that fails its seam check: the first, plus one redraw (Themes H and I). */
const SEAM_DRAWS = 2;

/**
 * The most provider requests a job can make — the worst case, every re-roll and redraw spent — which
 * is what the {@link SPRITE_MCP_MAX_REQUESTS} cap is checked against before an MCP job starts.
 * Rendering from 3D draws locally and costs nothing; a map costs its layout calls.
 */
export function estimateSpriteRequests(
  spec: SpriteAssetSpec,
  req: { clips?: readonly string[]; frames?: readonly string[]; turnaround?: boolean; method?: 'hand-drawn'; keepLayout?: boolean } = {},
): number {
  switch (spec.kind) {
    case 'sheet': {
      if (req.turnaround) return 1;
      const method = req.method ?? spec.method;
      if (method === 'rendered') return 0;
      if (method === 'one-shot') return 1;
      const perFrame = 1 + (spec.consistency.enabled ? spec.consistency.rerollBudget : 0);
      if (req.frames) return req.frames.length * perFrame;
      const dirs = spriteDirections(spec).length + (spec.directions === 1 && spec.targetPerspective === 'side' && !spec.mirror ? 1 : 0);
      const clips = spec.clips.filter((c) => !req.clips || req.clips.includes(c.name));
      return clips.reduce((sum, c) => sum + c.frames, 0) * dirs * perFrame;
    }
    case 'tileset':
      return spec.fromTerrain ? 0 : spec.terrains.length * SEAM_DRAWS;
    case 'background':
      return spec.layers.length * SEAM_DRAWS;
    case 'prop-sheet':
      return spec.props.length;
    case 'map':
      return req.keepLayout && spec.mapSpec ? 0 : 1 + SPRITE_MAP_MAX_REPAIRS;
  }
}
