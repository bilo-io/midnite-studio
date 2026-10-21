/**
 * Media ▸ Terrain over MCP (Phase 105 Theme J) — the `terrain_*` tools an agent uses to shape a
 * terrain iteratively: choose where the ground comes from, build it, look at the pictures, adjust,
 * export. Registered in `MCP_TOOLS` (`mcp.ts`) like every other tool.
 *
 * **The spec is `TerrainSpecSchema`.** `terrain_set_spec` takes a partial spec as an open record and
 * main validates it against the live schema (`media-terrain.ts`), so a new spec field reaches the
 * agent — through `terrain_get_spec`'s derived schema — without this file changing.
 *
 * **Connecting a session of your own.** These are ordinary Midnite MCP tools: enable Settings ▸ MCP,
 * turn on "Let agents edit terrains", then `claude mcp add midnite -- node <shim path from Settings ▸ MCP>`.
 */
import { z } from 'zod';

import { ImageProviderIdSchema, MediaProjectNameSchema } from './media';
import { ModelLibraryNameSchema } from './media-model-library';
import { TERRAIN_EXPORT_FORMATS, TERRAIN_EXPORT_TEXTURES, TERRAIN_INPUT_SLOTS, TerrainExportResultSchema, TerrainStatsSchema } from './media-terrain';

/** Ids of the tools, in the order an agent meets them. */
export const TERRAIN_MCP_TOOL_IDS = [
  'terrain_list',
  'terrain_open',
  'terrain_get_spec',
  'terrain_set_spec',
  'terrain_set_input',
  'terrain_build',
  'terrain_render_preview',
  'terrain_get_stats',
  'terrain_export',
] as const;
export type TerrainMcpToolId = (typeof TERRAIN_MCP_TOOL_IDS)[number];
export const isTerrainMcpToolId = (value: string): value is TerrainMcpToolId =>
  (TERRAIN_MCP_TOOL_IDS as readonly string[]).includes(value);

/** Tools that change a terrain, the window or the disk — gated by `Settings ▸ MCP ▸ Let agents edit terrains`. */
export const TERRAIN_MCP_WRITE_TOOL_IDS: readonly TerrainMcpToolId[] = [
  'terrain_open',
  'terrain_set_spec',
  'terrain_set_input',
  'terrain_build',
  'terrain_export',
];

/** Tools that can outlast the shim's default call timeout: a 4097² eroded build takes minutes. */
export const TERRAIN_SLOW_TOOL_IDS: readonly TerrainMcpToolId[] = ['terrain_set_input', 'terrain_build', 'terrain_render_preview', 'terrain_export'];
export const isTerrainSlowToolId = (value: string): boolean => (TERRAIN_SLOW_TOOL_IDS as readonly string[]).includes(value);
/** What the shim waits for one of the slow terrain tools (a model's 60 s is too short for a big build). */
export const TERRAIN_CALL_TIMEOUT_MS = 300_000;

/** The exact refusal the write tools answer with while `McpSettings.allowTerrains` is off. */
export const TERRAINS_OFF_MESSAGE = 'Terrain editing is off — Settings ▸ MCP ▸ Let agents edit terrains';

/** What `terrain_build` answers with no height source: a question for the agent, never a silent noise. */
export const TERRAIN_NEEDS_HEIGHT_SOURCE_MESSAGE =
  'No heightmap and no noise settings. Call terrain_set_input with a heightmap, or terrain_set_spec with a noise block, then build again.';

/** Named cameras a preview can be rendered from. */
export const TERRAIN_PREVIEW_VIEWS = ['top', 'oblique', 'horizon', 'landcover', 'roads'] as const;
export const TerrainPreviewViewSchema = z.enum(TERRAIN_PREVIEW_VIEWS);
export type TerrainPreviewView = z.infer<typeof TerrainPreviewViewSchema>;

/** Which terrain a call is about: a repository by path, a Terrain project, and the terrain's folder in it. */
export const TerrainToolTargetSchema = z.object({
  repoPath: z.string().min(1),
  project: MediaProjectNameSchema,
  /** The terrain's folder name (`dunes-20261004-120000`); `terrain_list` returns it. */
  terrain: ModelLibraryNameSchema,
});

export const TerrainListInputSchema = z.object({
  repoPath: z.string().min(1),
  project: MediaProjectNameSchema.optional(),
});
export const TerrainListResultSchema = z.object({
  projects: z.array(
    z.object({
      name: z.string(),
      terrains: z.array(z.object({ terrain: z.string(), name: z.string(), built: z.boolean(), resolution: z.number().int(), mtimeMs: z.number() })),
    }),
  ),
});

export const TerrainOpenResultSchema = z.object({ opened: z.literal(true), terrain: z.string() });

export const TerrainGetSpecResultSchema = z.object({
  spec: z.record(z.string(), z.unknown()),
  built: z.boolean(),
  /** JSON Schema of the spec, so an agent learns the fields and limits from the tool itself. */
  schema: z.unknown(),
  /** What to do next, in a sentence. */
  hint: z.string(),
});

export const TerrainSetSpecInputSchema = TerrainToolTargetSchema.extend({
  /** A partial spec: top-level keys replace the stored ones whole. `inputs` is owned by `terrain_set_input`. */
  patch: z.record(z.string(), z.unknown()),
});
export const TerrainToolIssueSchema = z.object({ path: z.string(), message: z.string() });
export type TerrainToolIssue = z.infer<typeof TerrainToolIssueSchema>;
/** `terrain_set_spec` answers: applied, or the structured reasons nothing changed. */
export const TerrainEditResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), terrain: z.string(), revision: z.number().int().min(0), spec: z.record(z.string(), z.unknown()) }),
  z.object({ ok: z.literal(false), errors: z.array(TerrainToolIssueSchema) }),
]);
export type TerrainEditResult = z.infer<typeof TerrainEditResultSchema>;

export const TerrainSetInputInputSchema = TerrainToolTargetSchema.extend({
  slot: z.enum(TERRAIN_INPUT_SLOTS),
  /** A PNG/JPEG/WebP inside the repository, relative to `repoPath` (symlinks out of it are refused). */
  path: z.string().min(1).max(1024).optional(),
  /** Heightmap only: describe the ground and an image provider paints the heightmap. */
  prompt: z.string().trim().min(1).max(1000).optional(),
  provider: ImageProviderIdSchema.optional(),
  model: z.string().min(1).optional(),
  /** Detach the slot's image. */
  remove: z.boolean().optional(),
});
export const TerrainMcpSetInputResultSchema = z.object({
  slot: z.enum(TERRAIN_INPUT_SLOTS),
  attached: z.boolean(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  warnings: z.array(z.string()),
});

export const TerrainMcpBuildResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('built'), stats: TerrainStatsSchema }),
  z.object({ status: z.literal('needs-height-source'), message: z.string() }),
]);

export const TerrainRenderPreviewInputSchema = TerrainToolTargetSchema.extend({
  views: z.array(TerrainPreviewViewSchema).min(1).max(TERRAIN_PREVIEW_VIEWS.length).optional(),
  size: z.number().int().min(128).max(768).optional(),
});

export const TerrainGetStatsResultSchema = z.discriminatedUnion('built', [
  z.object({ built: z.literal(false) }),
  z.object({ built: z.literal(true), stats: TerrainStatsSchema }),
]);

export const TerrainExportInputSchema = TerrainToolTargetSchema.extend({
  format: z.enum(TERRAIN_EXPORT_FORMATS).optional(),
  /** Repo-relative folder to write into; defaults to the terrain's own `export/` folder. An existing pack is never overwritten. */
  dest: z.string().min(1).max(1024).optional(),
  /** The glb's chunk LOD, 0 (finest) to 3. */
  lod: z.number().int().min(0).max(3).optional(),
  texture: z.enum(TERRAIN_EXPORT_TEXTURES).optional(),
  foliage: z.boolean().optional(),
  roads: z.boolean().optional(),
  buildings: z.boolean().optional(),
});
export const TerrainExportOutputSchema = TerrainExportResultSchema.extend({
  /** Repo-relative path of what was written, when it is inside the repository. */
  relativePath: z.string().optional(),
});
