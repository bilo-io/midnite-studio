/**
 * Media ▸ Terrain (Phase 105) — the wire contract and the on-disk spec.
 *
 * A terrain is a **folder**, `.midnite/media/terrain/<group>/<terrain>/`:
 *
 *   terrain.json   the {@link TerrainSpec}, the source of truth (also carries `lastBuild`)
 *   inputs/        the attached images, always PNG (JPEG/WebP are transcoded once, at attach)
 *   build/         generated heightfield and maps — disposable, rebuilt from the spec
 *   export/        written by Theme I
 *
 * Every spec field is optional with a default, so later themes add fields without breaking an old
 * `terrain.json`; the top level is `passthrough` for the same reason (and so an older build that
 * rewrites the file keeps what it does not understand).
 */
import { z } from 'zod';

import { GitOpResultOf, GitOpResultSchema } from './domain/result';
import { ModelLibraryNameSchema } from './media-model-library';
import { MediaProjectNameSchema } from './media';

// --- constants ---------------------------------------------------------------

export const TERRAIN_SPEC_FILE = 'terrain.json';
export const DEFAULT_TERRAIN_PROJECT = 'terrains';

/** Vertices per side: 2ⁿ+1. */
export const TERRAIN_RESOLUTIONS = [129, 257, 513, 1025, 2049, 4097] as const;
export type TerrainResolution = (typeof TERRAIN_RESOLUTIONS)[number];
export const TERRAIN_TEXTURE_SIZES = [1024, 2048, 4096, 8192] as const;

export const TERRAIN_INPUT_SLOTS = ['heightmap', 'satellite', 'roads'] as const;
export type TerrainInputSlot = (typeof TERRAIN_INPUT_SLOTS)[number];
export const TERRAIN_INPUT_MAX_BYTES = 256 * 1024 * 1024;
export const TERRAIN_INPUT_MAX_SIDE = 8192;

/** The land-cover classes Theme F fills in; the stats carry a percentage for each. */
export const TERRAIN_CLASSES = ['vegetation', 'bare', 'water', 'road', 'building'] as const;
export type TerrainClass = (typeof TERRAIN_CLASSES)[number];

/** The pipeline stages, in order. A stage with no inputs is skipped without a progress event. */
export const TERRAIN_BUILD_STAGES = [
  'decode',
  'heightfield',
  'erosion',
  'drape',
  'landcover',
  'splat',
  'roads',
  'conform',
  'foliage',
  'buildings',
  'write',
] as const;
export type TerrainBuildStage = (typeof TERRAIN_BUILD_STAGES)[number];
export const TerrainBuildStageSchema = z.enum(TERRAIN_BUILD_STAGES);

/** What `build/` holds. Later themes append to this one list, so export and the tests read it once. */
export const TERRAIN_BUILD_FILES = ['heights.f32', 'chunks.json'] as const;

export const TERRAIN_SHADING_MODES = ['shaded', 'wireframe', 'height', 'slope', 'landcover', 'splat', 'roads'] as const;

/** The prompt wrapped around a user's description when a heightmap is generated (Theme C). */
export const TERRAIN_HEIGHTMAP_PROMPT = (user: string): string =>
  `A top-down greyscale heightmap of ${user}. Pure greyscale, no colour, no text, no shading, no border; white is the highest ground and black the lowest; square.`;

export const TERRAIN_NOT_AVAILABLE = 'Terrain building is not available yet.';
export const TERRAIN_BUILD_CANCELLED = 'Build cancelled.';
export const TERRAIN_WORKER_CRASHED =
  'The terrain builder stopped unexpectedly (it may have run out of memory). Try a lower resolution.';

// --- spec --------------------------------------------------------------------

export const TerrainInputRefSchema = z.object({
  /** Always the transcoded PNG inside the terrain folder. */
  file: z.string().regex(/^inputs\/(heightmap|satellite|roads)\.png$/),
  /** The original filename, for display. */
  sourceName: z.string().max(255),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bitDepth: z.union([z.literal(8), z.literal(16)]),
});
export type TerrainInputRef = z.infer<typeof TerrainInputRefSchema>;

export const TerrainNoiseSchema = z.object({
  kind: z.enum(['fbm', 'ridged']).default('fbm'),
  seed: z.number().int().min(0).default(0),
  octaves: z.number().int().min(1).max(10).default(6),
  frequency: z.number().min(0.1).max(16).default(2),
  persistence: z.number().min(0.1).max(0.9).default(0.5),
  lacunarity: z.number().min(1.5).max(3).default(2),
  island: z.boolean().default(false),
  erosion: z.object({ iterations: z.number().int().min(0).max(500_000).default(50_000) }).default({}),
});
export type TerrainNoise = z.infer<typeof TerrainNoiseSchema>;

export const TerrainAlignmentSchema = z.object({
  /** Fractions of the world size, −1..1. */
  offset: z.tuple([z.number().min(-1).max(1), z.number().min(-1).max(1)]).default([0, 0]),
  scale: z.tuple([z.number().min(0.1).max(10), z.number().min(0.1).max(10)]).default([1, 1]),
  rotationDeg: z.number().min(-180).max(180).default(0),
});
export type TerrainAlignment = z.infer<typeof TerrainAlignmentSchema>;

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const TerrainStatsSchema = z.object({
  resolution: z.number().int().positive(),
  worldSize: z.number().positive(),
  vertexCount: z.number().int().nonnegative(),
  /** At LOD 0. */
  triangleCount: z.number().int().nonnegative(),
  chunkCount: z.number().int().nonnegative(),
  lodCount: z.number().int().positive(),
  buildMs: z.number().nonnegative(),
  minHeight: z.number(),
  maxHeight: z.number(),
  histogram: z.array(z.number().int().nonnegative()).length(16),
  classPercent: z.record(z.enum(TERRAIN_CLASSES), z.number()).optional(),
  roadCount: z.number().int().nonnegative().optional(),
  roadLengthM: z.number().nonnegative().optional(),
  buildingCount: z.number().int().nonnegative().optional(),
  foliageCount: z.number().int().nonnegative().optional(),
  warnings: z.array(z.string()),
});
export type TerrainStats = z.infer<typeof TerrainStatsSchema>;

export const TerrainLastBuildSchema = z.object({
  at: z.string(),
  buildMs: z.number().nonnegative(),
  stats: TerrainStatsSchema,
});
export type TerrainLastBuild = z.infer<typeof TerrainLastBuildSchema>;

export const TerrainSpecSchema = z
  .object({
    version: z.literal(1).default(1),
    name: z.string().max(120).default('Terrain'),
    inputs: z
      .object({
        heightmap: TerrainInputRefSchema.optional(),
        satellite: TerrainInputRefSchema.optional(),
        roads: TerrainInputRefSchema.optional(),
      })
      .default({}),
    resolution: z
      .union([z.literal(129), z.literal(257), z.literal(513), z.literal(1025), z.literal(2049), z.literal(4097)])
      .default(513),
    /** Metres per side. */
    worldSize: z.number().min(16).max(65_536).default(1024),
    heightRange: z
      .tuple([z.number(), z.number()])
      .refine(([a, b]) => b > a, 'heightRange must rise: [min, max] with max > min')
      .default([0, 200]),
    /** Metres. Absent: no water plane and no `water` class from height. */
    seaLevel: z.number().optional(),
    /** Used only when there is no heightmap (Theme C). Absent + no heightmap = `needs-height-source`. */
    noise: TerrainNoiseSchema.optional(),
    /** Gaussian σ in source pixels applied before resampling; decided at attach (1 for 8-bit, 0 for 16-bit). */
    preSmooth: z.number().min(0).max(4).default(0),
    alignment: z
      .object({
        satellite: TerrainAlignmentSchema.optional(),
        /** `'satellite'` follows the satellite's alignment. */
        roads: z.union([TerrainAlignmentSchema, z.literal('satellite')]).default('satellite'),
      })
      .default({}),
    textureSize: z
      .union([z.literal(1024), z.literal(2048), z.literal(4096), z.literal(8192)])
      .default(2048),
    classes: z
      .object({
        vision: z.object({ enabled: z.boolean().default(false), model: z.string().optional() }).default({}),
        k: z.number().int().min(4).max(12).default(8),
        exgThreshold: z.number().default(0.05),
        rockSlopeDeg: z.number().default(35),
      })
      .default({}),
    foliage: z
      .object({
        seed: z.number().int().min(0).default(1),
        treeDensity: z.number().min(0).max(50).default(4),
        grassDensity: z.number().min(0).max(200).default(30),
        slopeLimitDeg: z.number().default(35),
        scale: z.tuple([z.number(), z.number()]).default([0.8, 1.3]),
        margin: z.number().default(2),
        assets: z.record(z.enum(['tree', 'grass']), z.array(z.string())).optional(),
      })
      .default({}),
    buildings: z
      .object({
        seed: z.number().int().min(0).default(1),
        height: z.tuple([z.number(), z.number()]).default([4, 18]),
        scaleByArea: z.boolean().default(true),
        minAreaM2: z.number().default(20),
        snapToleranceDeg: z.number().default(12),
        flattenBlendM: z.number().default(3),
      })
      .default({}),
    roads: z
      .object({
        colour: Hex.optional(),
        tolerance: z.number().min(0).max(1).default(0.25),
        widthScale: z.number().min(0.25).max(4).default(1),
        widthClampM: z.tuple([z.number(), z.number()]).default([2, 30]),
        blendM: z.number().default(6),
        maxCutFillM: z.number().default(4),
        spurMinM: z.number().default(8),
      })
      .default({}),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    lastBuild: TerrainLastBuildSchema.optional(),
  })
  .passthrough();
export type TerrainSpec = z.infer<typeof TerrainSpecSchema>;
export type TerrainSpecInput = z.input<typeof TerrainSpecSchema>;

/** The spec a fresh terrain starts from: every default, no inputs. */
export const TERRAIN_SPEC_DEFAULTS: TerrainSpec = TerrainSpecSchema.parse({});

/** Fills defaults; throws (a `ZodError`) on a wrong `version` or an out-of-range value, never on a missing optional field. */
export function parseTerrainSpec(value: unknown): TerrainSpec {
  return TerrainSpecSchema.parse(value);
}

/** The one rule UI and MCP share: nothing to shape the ground from. */
export const needsHeightSource = (spec: Pick<TerrainSpec, 'inputs' | 'noise'>): boolean =>
  !spec.inputs.heightmap && !spec.noise;

// --- naming ------------------------------------------------------------------

/** `"Sand Dunes!"` → `sand-dunes`. */
export function terrainSlug(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return slug || 'terrain';
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** `YYYYMMDD-HHMMSS`, local time. */
export function terrainTimeStamp(date: Date): string {
  return (
    `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}-` +
    `${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`
  );
}

/** A terrain folder's display label: its name without the trailing `-YYYYMMDD-HHMMSS`. */
export const terrainFolderLabel = (folder: string): string => folder.replace(/-\d{8}-\d{6}$/, '') || folder;

// --- build result ------------------------------------------------------------

export const TerrainBuildResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('built'), stats: TerrainStatsSchema }),
  z.object({ status: z.literal('needs-height-source') }),
]);
export type TerrainBuildResult = z.infer<typeof TerrainBuildResultSchema>;

// --- IPC payloads ------------------------------------------------------------

export const TerrainTargetSchema = z.object({
  repoId: z.string().min(1),
  project: MediaProjectNameSchema,
  terrain: ModelLibraryNameSchema,
});
export type TerrainTarget = z.infer<typeof TerrainTargetSchema>;

export const TerrainLibraryRequestSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('create'), repoId: z.string().min(1), project: MediaProjectNameSchema.optional(), name: z.string().trim().min(1).max(120) }),
  TerrainTargetSchema.extend({ op: z.literal('rename'), to: z.string().trim().min(1).max(120) }),
  TerrainTargetSchema.extend({ op: z.literal('duplicate') }),
  TerrainTargetSchema.extend({ op: z.literal('delete') }),
]);
export type TerrainLibraryRequest = z.infer<typeof TerrainLibraryRequestSchema>;
export const TerrainLibraryResultSchema = z.object({ project: z.string().optional(), terrain: z.string().optional() });
export type TerrainLibraryResult = z.infer<typeof TerrainLibraryResultSchema>;

export const TerrainGetResultSchema = z.object({ spec: TerrainSpecSchema, built: z.boolean() });
export type TerrainGetResult = z.infer<typeof TerrainGetResultSchema>;

export const TerrainSetSpecRequestSchema = TerrainTargetSchema.extend({
  /** A partial spec, merged shallowly over the stored one (nested objects replaced whole), then validated. */
  patch: z.record(z.unknown()),
});
export type TerrainSetSpecRequest = z.infer<typeof TerrainSetSpecRequestSchema>;

/** Raw image bytes: structured-cloned across IPC, so main sees an `ArrayBuffer` or a `Uint8Array`. */
const Bytes = z.custom<ArrayBuffer | Uint8Array>((value) => value instanceof ArrayBuffer || value instanceof Uint8Array, 'expected image bytes');
export const TerrainSetInputRequestSchema = z.union([
  TerrainTargetSchema.extend({ slot: z.enum(TERRAIN_INPUT_SLOTS), bytes: Bytes, name: z.string().max(255) }),
  TerrainTargetSchema.extend({ slot: z.enum(TERRAIN_INPUT_SLOTS), remove: z.literal(true) }),
]);
export type TerrainSetInputRequest = z.infer<typeof TerrainSetInputRequestSchema>;
export const TerrainSetInputResultSchema = z.object({
  input: TerrainInputRefSchema.optional(),
  warnings: z.array(z.string()),
});
export type TerrainSetInputResult = z.infer<typeof TerrainSetInputResultSchema>;

export const TerrainBuildRequestSchema = TerrainTargetSchema.extend({
  /** The renderer's own id for this build, so it can cancel before the first progress event. */
  buildId: z.string().min(1).optional(),
});
export type TerrainBuildRequest = z.infer<typeof TerrainBuildRequestSchema>;

export const TerrainCancelRequestSchema = z.object({ buildId: z.string().min(1) });

/** Themes F, H and I own these three; until they land each answers {@link TERRAIN_NOT_AVAILABLE}. */
export const TerrainPaintRequestSchema = TerrainTargetSchema.passthrough();
export const TerrainRoadKeyRequestSchema = TerrainTargetSchema.passthrough();
export const TerrainExportRequestSchema = TerrainTargetSchema.passthrough();

export const TerrainProgressEventSchema = z.object({
  buildId: z.string(),
  stage: TerrainBuildStageSchema,
  fraction: z.number().min(0).max(1),
});
export type TerrainProgressEvent = z.infer<typeof TerrainProgressEventSchema>;

export const TerrainChangedEventSchema = z.object({
  repoId: z.string(),
  project: z.string(),
  terrain: z.string(),
  revision: z.number().int().nonnegative(),
});
export type TerrainChangedEvent = z.infer<typeof TerrainChangedEventSchema>;

/** `terrain_open` (Theme J) asks the tab to show a terrain. */
export const TerrainOpenEventSchema = z.object({ repoId: z.string(), project: z.string(), terrain: z.string() });
export type TerrainOpenEvent = z.infer<typeof TerrainOpenEventSchema>;

export const TerrainResultSchemas = {
  library: GitOpResultOf(TerrainLibraryResultSchema),
  get: GitOpResultOf(TerrainGetResultSchema),
  setSpec: GitOpResultOf(z.object({ spec: TerrainSpecSchema })),
  setInput: GitOpResultOf(TerrainSetInputResultSchema),
  build: GitOpResultOf(TerrainBuildResultSchema),
  generic: GitOpResultSchema,
} as const;

// --- build output ------------------------------------------------------------

/** `build/chunks.json`: what the viewer needs to pick and cull chunks without reading the heights first. */
export const TerrainChunksFileSchema = z.object({
  resolution: z.number().int().positive(),
  worldSize: z.number().positive(),
  heightRange: z.tuple([z.number(), z.number()]),
  chunkVerts: z.number().int().positive(),
  chunksPerSide: z.number().int().positive(),
  lodCount: z.number().int().positive(),
  chunks: z.array(
    z.object({
      cx: z.number().int().nonnegative(),
      cz: z.number().int().nonnegative(),
      minY: z.number(),
      maxY: z.number(),
      centre: z.tuple([z.number(), z.number(), z.number()]),
      radius: z.number(),
    }),
  ),
});
export type TerrainChunksFile = z.infer<typeof TerrainChunksFileSchema>;
