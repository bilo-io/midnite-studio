/**
 * Media ▸ Sprites (Phase 106) — the wire contract and the on-disk spec.
 *
 * An asset is a **folder**, `.midnite/media/sprite/<group>/<asset>/`, where `<group>` is one of five
 * fixed folders keyed by kind ({@link SPRITE_GROUPS}) and the asset folder is
 * `<slug>-<YYYYMMDD-HHMMSS>`:
 *
 *   sprite.json          the {@link SpriteAssetSpec}, the source of truth (also `createdAt`/`lastReport`)
 *   reference/           the locked reference image (Theme D)
 *   frames/<clip>/<dir>/<n>.png   normalised frames, the editable truth (`<n>` is zero-padded)
 *   frames/frames.json   per-frame metadata ({@link SpriteFramesFile})
 *   export/              written by Theme G
 *
 * Every field is defaulted so later themes add fields without breaking an old `sprite.json`.
 */
import { z } from 'zod';

import { GitOpResultOf, GitOpResultSchema } from './domain/result';
import { ModelLibraryNameSchema } from './media-model-library';
import { ImageProviderIdSchema } from './media';

// --- constants ---------------------------------------------------------------

export const SPRITE_SPEC_FILE = 'sprite.json';
export const SPRITE_FRAMES_FILE = 'frames/frames.json';

/** The five fixed groups. Users do not create groups; the explorer always shows all five. */
export const SPRITE_GROUPS = {
  characters: 'Characters',
  objects: 'Objects',
  tilesets: 'Tilesets',
  backgrounds: 'Backgrounds',
  maps: 'Maps',
} as const;
export type SpriteGroupId = keyof typeof SPRITE_GROUPS;
export const SPRITE_GROUP_IDS = Object.keys(SPRITE_GROUPS) as [SpriteGroupId, ...SpriteGroupId[]];
export const SpriteGroupIdSchema = z.enum(SPRITE_GROUP_IDS);

export const SPRITE_STYLES = ['pixel', 'hand-drawn', 'painterly', 'flat'] as const;
export const SPRITE_PERSPECTIVES = ['side', 'top-down', 'isometric', 'front'] as const;
export const SPRITE_METHODS = ['hand-drawn', 'rendered', 'one-shot'] as const;
export const SPRITE_LOOPS = ['loop', 'once', 'ping-pong'] as const;
export type SpriteStyle = (typeof SPRITE_STYLES)[number];
export type SpritePerspective = (typeof SPRITE_PERSPECTIVES)[number];
export type SpriteMethod = (typeof SPRITE_METHODS)[number];
export type SpriteLoop = (typeof SPRITE_LOOPS)[number];

export const SPRITE_PROGRESS_STAGES = ['generating', 'processing', 'checking', 'packing'] as const;

export const SPRITE_JOB_BUSY = 'This asset is already generating. Cancel it first.';
export const SPRITE_JOB_CANCELLED = 'Generation cancelled.';
export const SPRITE_NOT_AVAILABLE = 'This sprite operation is not available yet.';
export const SPRITE_FRAME_SOURCES_PENDING =
  'Frame generation for this method has not landed yet (Phase 106 Themes D, E and F).';
export const SPRITE_NEEDS_MODEL = 'Attach a rigged model before rendering from 3D.';
/** Hand-drawn (Theme D): frames are only ever drawn against a locked, approved reference. */
export const SPRITE_APPROVE_FIRST = 'Approve a reference first.';
export const SPRITE_NO_REFERENCE = 'Generate or attach a reference first.';
/** Asked when a new reference is approved over frames drawn from the old one. */
export const SPRITE_REFERENCE_CHANGED = 'Frames were made from the old reference. Keep them?';

// --- spec --------------------------------------------------------------------

export const SpriteClipSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/, 'lower-case letters, digits and dashes; starts with a letter; ≤ 32'),
  frames: z.number().int().min(1).max(64),
  fps: z.number().min(1).max(60).default(8),
  loop: z.enum(SPRITE_LOOPS).default('loop'),
  /** One pose description per frame (hand-drawn, Theme D). */
  poses: z.array(z.string().max(300)).optional(),
});
export type SpriteClip = z.infer<typeof SpriteClipSchema>;

const Dim = z.number().int().min(8).max(512);
const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const SpritePaletteSchema = z.union([
  z.object({ colours: z.array(Hex).min(2).max(256) }),
  z.object({ size: z.number().int().min(4).max(256) }),
]);

export const SpriteReferenceSchema = z.union([
  z.object({ kind: z.literal('image'), file: z.literal('reference/reference.png'), approved: z.boolean().default(false) }),
  z.object({ kind: z.literal('model'), project: z.string().min(1), path: z.string().min(1) }),
]);
export type SpriteReference = z.infer<typeof SpriteReferenceSchema>;

export const SpriteReportSchema = z.object({ frames: z.number().int().nonnegative(), failing: z.number().int().nonnegative(), at: z.string() });
export type SpriteReport = z.infer<typeof SpriteReportSchema>;

/** Fields every kind carries. */
const base = {
  version: z.literal(1).default(1),
  name: z.string().min(1).max(120),
  prompt: z.string().max(4000).default(''),
  style: z.enum(SPRITE_STYLES).default('pixel'),
  provider: ImageProviderIdSchema.optional(),
  model: z.string().min(1).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  lastReport: SpriteReportSchema.optional(),
};

/** Directions → names. A 1-direction sheet's facing depends on the perspective ({@link spriteDirections}). */
export const SPRITE_DIRECTIONS = {
  1: [] as readonly string[],
  4: ['s', 'w', 'n', 'e'],
  8: ['s', 'sw', 'w', 'nw', 'n', 'ne', 'e', 'se'],
} as const;

export const SpriteSheetSpecSchema = z.object({
  ...base,
  kind: z.literal('sheet'),
  category: z.enum(['character', 'object']).default('character'),
  targetPerspective: z.enum(SPRITE_PERSPECTIVES).default('side'),
  frameSize: z.tuple([Dim, Dim]).default([64, 64]),
  directions: z.union([z.literal(1), z.literal(4), z.literal(8)]).default(1),
  anchor: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).default({ x: 0.5, y: 1 }),
  palette: SpritePaletteSchema.optional(),
  outline: z.boolean().default(false),
  method: z.enum(SPRITE_METHODS).default('hand-drawn'),
  clips: z.array(SpriteClipSchema).max(32).default([]),
  reference: SpriteReferenceSchema.optional(),
  /** Theme E's render settings; declared loose so the theme can tighten it. */
  render: z.record(z.unknown()).optional(),
  /** Theme D: the vision check of every frame against the locked reference. */
  consistency: z
    .object({
      threshold: z.number().min(0).max(1).default(0.7),
      rerollBudget: z.number().int().min(0).max(5).default(2),
      /** Off: frames are not checked (and carry no consistency badge — the user chose it). */
      enabled: z.boolean().default(true),
    })
    .default({}),
  /**
   * Theme D: a 1-direction side sheet draws only `e` and writes `w` as its mirror (`source: 'mirrored'`,
   * `flipped: true`). Off ("My character is asymmetric") draws `w` with the same pose table instead.
   */
  mirror: z.boolean().default(true),
});
export type SpriteSheetSpec = z.infer<typeof SpriteSheetSpecSchema>;

export const TilesetSpecSchema = z.object({
  ...base,
  kind: z.literal('tileset'),
  /** Isometric tiles are a tileset with a diamond projection (Theme I). */
  projection: z.enum(['orthogonal', 'isometric']).default('orthogonal'),
  tileSize: z.number().int().min(8).max(256).default(32),
  autotile: z.enum(['blob47', 'corner16', 'none']).default('blob47'),
  terrains: z.array(z.string().min(1).max(40)).max(16).default(['grass', 'dirt']),
});
export type TilesetSpec = z.infer<typeof TilesetSpecSchema>;

export const BackgroundSpecSchema = z.object({
  ...base,
  kind: z.literal('background'),
  size: z.tuple([z.number().int().min(64).max(4096), z.number().int().min(64).max(4096)]).default([640, 360]),
  layers: z.number().int().min(1).max(8).default(3),
});
export type BackgroundSpec = z.infer<typeof BackgroundSpecSchema>;

export const PropSheetSpecSchema = z.object({
  ...base,
  kind: z.literal('prop-sheet'),
  cell: z.tuple([Dim, Dim]).default([64, 64]),
  props: z.array(z.string().min(1).max(60)).max(64).default([]),
});
export type PropSheetSpec = z.infer<typeof PropSheetSpecSchema>;

export const MapAssetSpecSchema = z.object({
  ...base,
  kind: z.literal('map'),
  /** The tileset asset folder the map is built from. */
  tileset: z.string().min(1).optional(),
  size: z.tuple([z.number().int().min(4).max(512), z.number().int().min(4).max(512)]).default([40, 24]),
  tileSize: z.number().int().min(8).max(256).default(32),
});
export type MapAssetSpec = z.infer<typeof MapAssetSpecSchema>;

export const SpriteAssetSpecSchema = z.discriminatedUnion('kind', [
  SpriteSheetSpecSchema,
  TilesetSpecSchema,
  BackgroundSpecSchema,
  PropSheetSpecSchema,
  MapAssetSpecSchema,
]);
export type SpriteAssetSpec = z.infer<typeof SpriteAssetSpecSchema>;
export type SpriteAssetSpecInput = z.input<typeof SpriteAssetSpecSchema>;
export type SpriteKind = SpriteAssetSpec['kind'];

export function parseSpriteSpec(value: unknown): SpriteAssetSpec {
  return SpriteAssetSpecSchema.parse(value);
}

/** The folder names of a sheet's directions: `side`/1 faces east, other 1-direction sheets face south. */
export function spriteDirections(spec: Pick<SpriteSheetSpec, 'directions' | 'targetPerspective'>): readonly string[] {
  if (spec.directions === 1) return [spec.targetPerspective === 'side' ? 'e' : 's'];
  return SPRITE_DIRECTIONS[spec.directions];
}

/** Which of the five folders an asset lives in. */
export function spriteGroupOf(spec: Pick<SpriteAssetSpec, 'kind'> & { category?: string }): SpriteGroupId {
  switch (spec.kind) {
    case 'sheet':
      return spec.category === 'object' ? 'objects' : 'characters';
    case 'prop-sheet':
      return 'objects';
    case 'tileset':
      return 'tilesets';
    case 'background':
      return 'backgrounds';
    case 'map':
      return 'maps';
  }
}

// --- frames file -------------------------------------------------------------

/**
 * Frame badges. `empty`, `clipped`, `height` and `drift` come from the frame pipeline (Theme B);
 * `inconsistent`/`unchecked` from the consistency check (D); `grid` from one-shot slicing (F).
 */
export const SPRITE_BADGES = ['empty', 'clipped', 'height', 'drift', 'inconsistent', 'unchecked', 'grid'] as const;
export const SpriteBadgeSchema = z.enum(SPRITE_BADGES);
export type SpriteBadge = z.infer<typeof SpriteBadgeSchema>;

export const SpriteFrameMetaSchema = z.object({
  anchorNudge: z.tuple([z.number().int(), z.number().int()]).default([0, 0]),
  flipped: z.boolean().default(false),
  source: z.enum(['generated', 'rendered', 'sliced', 'mirrored']).default('generated'),
  badges: z.array(SpriteBadgeSchema).default([]),
  score: z.number().min(0).max(1).optional(),
  /** What the consistency check found wrong (Theme D) — the `inconsistent` badge's tooltip. */
  issues: z.array(z.string().max(300)).max(8).optional(),
});
export type SpriteFrameMeta = z.infer<typeof SpriteFrameMetaSchema>;

export const SpriteFramesFileSchema = z.object({
  version: z.literal(1).default(1),
  /** Keyed `<clip>/<dir>/<n>`. */
  frames: z.record(SpriteFrameMetaSchema).default({}),
  /**
   * Per direction, the alpha-bounds height (source pixels) of the reference frame that set the sheet's
   * scale (Theme B). Kept so regenerating one clip scales it exactly like the frames already on disk.
   */
  referenceHeights: z.record(z.number().positive()).default({}),
});
export type SpriteFramesFile = z.infer<typeof SpriteFramesFileSchema>;

/** `frames/<clip>/<dir>/<nnn>.png`, `<n>` zero-padded to three digits. */
export const spriteFramePath = (clip: string, dir: string, n: number): string => `frames/${clip}/${dir}/${String(n).padStart(3, '0')}.png`;
export const spriteFrameKey = (clip: string, dir: string, n: number): string => `${clip}/${dir}/${String(n).padStart(3, '0')}`;

// --- naming ------------------------------------------------------------------

/** `"Hero Knight!"` → `hero-knight`. */
export function spriteSlug(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return slug || 'sprite';
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** `YYYYMMDD-HHMMSS`, local time. */
export function spriteTimeStamp(date: Date): string {
  return (
    `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}-` +
    `${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`
  );
}

/** An asset folder's display label: its name without the trailing `-YYYYMMDD-HHMMSS`. */
export const spriteFolderLabel = (folder: string): string => folder.replace(/-\d{8}-\d{6}(-\d+)?$/, '') || folder;

// --- IPC payloads ------------------------------------------------------------

export const SpriteTargetSchema = z.object({
  repoId: z.string().min(1),
  group: SpriteGroupIdSchema,
  asset: ModelLibraryNameSchema,
});
export type SpriteTarget = z.infer<typeof SpriteTargetSchema>;

export const SpriteLibraryRequestSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('create'),
    repoId: z.string().min(1),
    /** A full or partial spec; the group follows its kind (and a sheet's category). */
    spec: z.record(z.unknown()),
  }),
  SpriteTargetSchema.extend({ op: z.literal('rename'), to: z.string().trim().min(1).max(120) }),
  SpriteTargetSchema.extend({ op: z.literal('duplicate') }),
  SpriteTargetSchema.extend({ op: z.literal('delete') }),
]);
export type SpriteLibraryRequest = z.infer<typeof SpriteLibraryRequestSchema>;
export const SpriteLibraryResultSchema = z.object({ group: SpriteGroupIdSchema.optional(), asset: z.string().optional() });
export type SpriteLibraryResult = z.infer<typeof SpriteLibraryResultSchema>;

export const SpriteGetResultSchema = z.object({
  spec: SpriteAssetSpecSchema,
  frames: SpriteFramesFileSchema,
  report: SpriteReportSchema.nullable(),
});
export type SpriteGetResult = z.infer<typeof SpriteGetResultSchema>;

export const SpriteSetSpecRequestSchema = SpriteTargetSchema.extend({
  /** A partial spec merged shallowly over the stored one (nested objects replaced whole), then validated. `kind` cannot change. */
  patch: z.record(z.unknown()),
});
export type SpriteSetSpecRequest = z.infer<typeof SpriteSetSpecRequestSchema>;

const Bytes = z.custom<ArrayBuffer | Uint8Array>((value) => value instanceof ArrayBuffer || value instanceof Uint8Array, 'expected image bytes');
export const SpriteSetReferenceRequestSchema = z.union([
  SpriteTargetSchema.extend({ bytes: Bytes, name: z.string().max(255) }),
  SpriteTargetSchema.extend({ model: z.object({ project: z.string().min(1), path: z.string().min(1) }) }),
  SpriteTargetSchema.extend({ remove: z.literal(true) }),
  /**
   * Locks the current reference image (Theme D). When frames exist, `frames` answers
   * {@link SPRITE_REFERENCE_CHANGED}: `keep` leaves them, `mark` badges every one `unchecked` for re-roll.
   */
  SpriteTargetSchema.extend({ approve: z.literal(true), frames: z.enum(['keep', 'mark']).default('keep') }),
]);
export type SpriteSetReferenceRequest = z.infer<typeof SpriteSetReferenceRequestSchema>;

export const SpriteGenerateRequestSchema = SpriteTargetSchema.extend({
  /** Only these clips (a re-generate); absent: every clip. */
  clips: z.array(z.string()).optional(),
  /** Hand-drawn step 1: draw a turnaround (front, side, back) as the unapproved reference instead of frames. */
  turnaround: z.literal(true).optional(),
});
export type SpriteGenerateRequest = z.infer<typeof SpriteGenerateRequestSchema>;

export const SpriteCancelRequestSchema = z.object({ jobId: z.string().min(1) });

export const SpriteFramePatchSchema = z.object({
  clip: z.string().min(1),
  dir: z.string().min(1),
  n: z.number().int().min(0).max(999),
  anchorNudge: z.tuple([z.number().int().min(-64).max(64), z.number().int().min(-64).max(64)]).optional(),
  flipped: z.boolean().optional(),
  delete: z.literal(true).optional(),
});
export type SpriteFramePatch = z.infer<typeof SpriteFramePatchSchema>;
export const SpritePatchFramesRequestSchema = SpriteTargetSchema.extend({ patches: z.array(SpriteFramePatchSchema).min(1).max(500) });
export type SpritePatchFramesRequest = z.infer<typeof SpritePatchFramesRequestSchema>;

/** Theme G owns the pack; until it lands the channel answers {@link SPRITE_NOT_AVAILABLE}. */
export const SpriteExportRequestSchema = SpriteTargetSchema.passthrough();

export const SpriteProgressEventSchema = z.object({
  jobId: z.string(),
  done: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  stage: z.enum(SPRITE_PROGRESS_STAGES),
  frame: z.string().optional(),
  /** Set on a job's final event: how it ended. Absent while it runs. */
  state: z.enum(['done', 'cancelled', 'failed']).optional(),
  /** Why a job ended `cancelled` or `failed`. */
  message: z.string().optional(),
});
export type SpriteProgressEvent = z.infer<typeof SpriteProgressEventSchema>;

export const SpriteChangedEventSchema = z.object({
  repoId: z.string(),
  group: SpriteGroupIdSchema,
  asset: z.string(),
  revision: z.number().int().nonnegative(),
});
export type SpriteChangedEvent = z.infer<typeof SpriteChangedEventSchema>;

/** `sprite_open` (Theme K) asks the tab to show an asset. */
export const SpriteOpenEventSchema = z.object({ repoId: z.string(), group: SpriteGroupIdSchema, asset: z.string() });
export type SpriteOpenEvent = z.infer<typeof SpriteOpenEventSchema>;

export const SpriteJobStatusSchema = z.object({
  jobId: z.string(),
  state: z.enum(['running', 'done', 'cancelled', 'failed']),
  done: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  message: z.string().optional(),
});
export type SpriteJobStatus = z.infer<typeof SpriteJobStatusSchema>;

export const SpriteResultSchemas = {
  library: GitOpResultOf(SpriteLibraryResultSchema),
  get: GitOpResultOf(SpriteGetResultSchema),
  setSpec: GitOpResultOf(z.object({ spec: SpriteAssetSpecSchema })),
  generate: GitOpResultOf(z.object({ jobId: z.string() })),
  generic: GitOpResultSchema,
} as const;
