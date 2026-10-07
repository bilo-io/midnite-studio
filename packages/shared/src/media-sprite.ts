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
 *   export/              the last packed atlas (Theme G): atlas.png, atlas.json, anims.json
 *
 * Every field is defaulted so later themes add fields without breaking an old `sprite.json`.
 */
import { z } from 'zod';

import { GitOpResultOf, GitOpResultSchema } from './domain/result';
import { ModelLibraryNameSchema } from './media-model-library';
import { ImageAspectSchema, ImageProviderIdSchema } from './media';

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
/** Rendered from 3D (Theme E): main asks the open window to render, and fails the job when nothing answers. */
export const SPRITE_RENDER_NO_WINDOW = 'Rendering from 3D needs the Midnite Studio window open.';
/** One-shot (Theme F): a grid this large is refused before any request. */
export const SPRITE_ONE_SHOT_MAX = 8;
export const SPRITE_ONE_SHOT_TOO_MANY = 'Too many frames for one image — use at most 8 frames and 8 rows, or switch to Hand-drawn.';
/** How long main waits for a window to acknowledge a render request. */
export const SPRITE_RENDER_READY_MS = 10_000;
/** Frames per `mediaSpriteRenderFrames` batch, at most. */
export const SPRITE_RENDER_BATCH = 32;
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

// --- one-shot sheet (Theme F) ---------------------------------------------------

/** The grid a one-shot sheet is asked for: one clip × direction per row, one frame per column. */
export const OneShotGridSchema = z.object({
  columns: z.number().int().min(1),
  rows: z.number().int().min(1),
  cell: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
  gutter: z.number().int().min(0),
});
export type OneShotGrid = z.infer<typeof OneShotGridSchema>;

/** Spans `[start, end)` in pixels. */
const Span = z.tuple([z.number().int().min(0), z.number().int().min(0)]);

/**
 * What a one-shot job asked for and what it found — written to `sprite.json` so the verdict and the
 * grid preview survive a reload. `mismatch` set means nothing was sliced.
 */
export const SpriteOneShotSchema = z.object({
  promptVersion: z.number().int().min(1),
  grid: OneShotGridSchema,
  aspect: ImageAspectSchema,
  /** Row order: which clip and direction each row of the sheet holds. */
  rows: z.array(z.object({ clip: z.string(), dir: z.string() })).default([]),
  /** The returned image's real size (cells are laid out in it, not in the requested size). */
  image: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).optional(),
  /** Projection-profile grid detection: content spans per column and per row. */
  detected: z.object({ columns: z.array(Span), rows: z.array(Span) }).optional(),
  mismatch: z.string().max(300).optional(),
});
export type SpriteOneShot = z.infer<typeof SpriteOneShotSchema>;

// --- render settings (Theme E) -------------------------------------------------

export const SPRITE_CAMERAS = ['side', 'top-down', 'isometric', 'custom'] as const;
export const SPRITE_SHADINGS = ['lit', 'toon', 'flat'] as const;
export type SpriteCamera = (typeof SPRITE_CAMERAS)[number];
export type SpriteShading = (typeof SPRITE_SHADINGS)[number];

/**
 * How a Models character is rendered into frames (Theme E). The camera is orthographic; `elevationDeg`
 * tilts it down from the horizon, and `azimuthDeg` turns every direction by the same amount (0 = the
 * directions exactly as named, `s` facing the viewer). Presets fill both from `camera`
 * (`resolveRenderSettings` in `sprite/camera.ts`); only `custom` keeps what was entered.
 */
export const SpriteRenderSettingsSchema = z.object({
  camera: z.enum(SPRITE_CAMERAS).default('side'),
  elevationDeg: z.number().min(-89).max(89).default(0),
  azimuthDeg: z.number().min(-360).max(360).default(0),
  shading: z.enum(SPRITE_SHADINGS).default('lit'),
  outline: z.boolean().default(false),
  supersample: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(4),
  /** Overrides every clip's fps when set. */
  fps: z.number().int().min(1).max(60).optional(),
});
export type SpriteRenderSettings = z.infer<typeof SpriteRenderSettingsSchema>;
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
  /** Theme E: how a rendered sheet's camera, shading and supersampling are set. */
  render: SpriteRenderSettingsSchema.optional(),
  /** Theme F: the last one-shot request — prompt version, grid, aspect and what grid detection found. */
  oneShot: SpriteOneShotSchema.optional(),
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

// --- environment specs (Themes H and I) -------------------------------------------

export const TILESET_COLLISIONS = ['walkable', 'solid', 'water'] as const;
export type TilesetCollision = (typeof TILESET_COLLISIONS)[number];
export const TILESET_TILE_SIZES = [16, 32, 48, 64] as const;
export const TILESET_SCHEMES = ['blob47', 'corner16'] as const;
export type TilesetScheme = (typeof TILESET_SCHEMES)[number];
export const TILESET_PROJECTIONS = ['orthogonal', 'isometric'] as const;
const TerrainId = z.string().regex(/^[a-z][a-z0-9-]*$/, 'lower-case letters, digits and dashes; starts with a letter');

/** One terrain of a tileset: a seamless base tile, generated from `prompt`. */
export const TilesetTerrainSchema = z.preprocess(
  (value) => (typeof value === 'string' ? { id: value, label: value } : value),
  z.object({
    id: TerrainId,
    label: z.string().min(1).max(40),
    prompt: z.string().max(400).default(''),
    collision: z.enum(TILESET_COLLISIONS).default('walkable'),
  }),
);
export type TilesetTerrain = z.infer<typeof TilesetTerrainSchema>;

/** "Render this Phase 105 terrain into a tile grid" — the terrain-to-tiles source (Theme I). */
export const TilesetFromTerrainSchema = z.object({
  project: z.string().min(1),
  terrain: z.string().min(1),
  /** World metres one tile covers. */
  metresPerTile: z.number().min(1).max(16).default(4),
});
export type TilesetFromTerrain = z.infer<typeof TilesetFromTerrainSchema>;

export const TilesetSpecSchema = z.object({
  ...base,
  kind: z.literal('tileset'),
  /** Isometric tiles are the orthogonal ones re-projected to a 2:1 diamond (Theme I). */
  projection: z.enum(TILESET_PROJECTIONS).default('orthogonal'),
  tileSize: z.union([z.literal(16), z.literal(32), z.literal(48), z.literal(64)]).default(32),
  terrains: z.array(TilesetTerrainSchema).min(1).max(8).default([
    { id: 'grass', label: 'Grass', prompt: 'lush grass', collision: 'walkable' },
    { id: 'dirt', label: 'Dirt', prompt: 'packed dirt', collision: 'walkable' },
  ]),
  /** Each pair builds a transition set: `b` painted over `a`. */
  transitions: z.array(z.object({ a: TerrainId, b: TerrainId })).max(16).default([{ a: 'grass', b: 'dirt' }]),
  scheme: z.enum(TILESET_SCHEMES).default('blob47'),
  /** Pixel style: one palette over every terrain (fixed colours, or this many from the tiles). */
  palette: SpritePaletteSchema.optional(),
  seed: z.number().int().min(0).max(2_147_483_647).default(1),
  /** Set: the job renders this terrain into tiles instead of generating terrain bases. */
  fromTerrain: TilesetFromTerrainSchema.optional(),
});
export type TilesetSpec = z.infer<typeof TilesetSpecSchema>;

export const BACKGROUND_SCROLL_DEFAULTS = [
  { name: 'sky', prompt: 'clear sky with soft clouds', scrollFactor: 0 },
  { name: 'far', prompt: 'distant mountains', scrollFactor: 0.2 },
  { name: 'mid', prompt: 'rolling hills and trees', scrollFactor: 0.5 },
  { name: 'near', prompt: 'foreground bushes and grass', scrollFactor: 0.8 },
] as const;

export const BackgroundLayerSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/, 'lower-case letters, digits and dashes; starts with a letter; ≤ 32'),
  prompt: z.string().max(400).default(''),
  scrollFactor: z.number().min(0).max(1),
});
export type BackgroundLayer = z.infer<typeof BackgroundLayerSchema>;

export const BackgroundSpecSchema = z.object({
  ...base,
  kind: z.literal('background'),
  size: z.tuple([z.number().int().min(64).max(4096), z.number().int().min(64).max(4096)]).default([1920, 1080]),
  layers: z.array(BackgroundLayerSchema).min(3).max(5).default(BACKGROUND_SCROLL_DEFAULTS.map((l) => ({ ...l }))),
});
export type BackgroundSpec = z.infer<typeof BackgroundSpecSchema>;

export const PropSchema = z.preprocess(
  (value) => (typeof value === 'string' ? { name: spriteSlug(value), prompt: value } : value),
  z.object({
    name: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/, 'lower-case letters, digits and dashes; starts with a letter; ≤ 40'),
    prompt: z.string().max(400).default(''),
  }),
);
export type SpriteProp = z.infer<typeof PropSchema>;

export const PropSheetSpecSchema = z.object({
  ...base,
  kind: z.literal('prop-sheet'),
  cell: z.tuple([Dim, Dim]).default([64, 64]),
  props: z.array(PropSchema).max(64).default([]),
  palette: SpritePaletteSchema.optional(),
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

/** What each badge's rule checks — the frame strip's tooltips (Theme G) and the MCP report. */
export const SPRITE_BADGE_RULES: Record<SpriteBadge, string> = {
  empty: 'Empty: less than 1 % of the frame is opaque.',
  clipped: 'Clipped: the subject touches the edge of the frame.',
  height: 'Height: more than 12 % off the clip’s median height.',
  drift: 'Drift: the body sits off the anchor.',
  inconsistent: 'Inconsistent: the vision check scored it below the threshold against the reference.',
  unchecked: 'Unchecked: the consistency check did not run for this frame.',
  grid: 'Grid: its one-shot cell was more than 20 % off the median cell.',
};

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
  /**
   * One-shot's hand-off (Theme F): an existing frame becomes the **approved** reference, so a failing
   * clip can be redrawn with Hand-drawn against it.
   */
  SpriteTargetSchema.extend({ fromFrame: z.object({ clip: z.string().min(1), dir: z.string().min(1), n: z.number().int().min(0).max(999) }) }),
]);
export type SpriteSetReferenceRequest = z.infer<typeof SpriteSetReferenceRequestSchema>;

export const SpriteGenerateRequestSchema = SpriteTargetSchema.extend({
  /** Only these clips (a re-generate); absent: every clip. */
  clips: z.array(z.string()).optional(),
  /** Hand-drawn step 1: draw a turnaround (front, side, back) as the unapproved reference instead of frames. */
  turnaround: z.literal(true).optional(),
  /** Run this job with another method than the spec's — one-shot's "Regenerate this clip with Hand-drawn" (Theme F). */
  method: z.literal('hand-drawn').optional(),
  /** Only these frames (`<clip>/<dir>/<nnn>`) — the frame strip's re-roll (Theme G). */
  frames: z.array(z.string().min(1)).max(64).optional(),
});
export type SpriteGenerateRequest = z.infer<typeof SpriteGenerateRequestSchema>;

export const SpriteCancelRequestSchema = z.object({ jobId: z.string().min(1) });

/** A frame key, `<clip>/<dir>/<nnn>`. */
export const SpriteFrameKeySchema = z.string().regex(/^[a-z][a-z0-9-]{0,31}\/[a-z]{1,2}\/\d{3}$/, 'a frame key is <clip>/<dir>/<nnn>');

/** Frame-strip edits per call, at most (Theme G). */
export const SPRITE_PATCH_MAX_OPS = 64;

/**
 * One frame-strip edit (Theme G). `nudge` moves the frame's content by `dx`/`dy` px (added to its
 * `anchorNudge`); `flip` toggles `flipped`; `delete` moves the frame to `frames/.trash/` and `restore`
 * brings it back (delete's undo); `move` reorders it within its clip and direction to position `to`;
 * `reroll` starts a generation job for just those frames (not undoable — it is a new generation).
 */
export const SpritePatchOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('nudge'), key: SpriteFrameKeySchema, dx: z.number().int().min(-64).max(64), dy: z.number().int().min(-64).max(64) }),
  z.object({ op: z.literal('flip'), key: SpriteFrameKeySchema }),
  z.object({ op: z.literal('delete'), key: SpriteFrameKeySchema }),
  z.object({ op: z.literal('restore'), key: SpriteFrameKeySchema }),
  z.object({ op: z.literal('move'), key: SpriteFrameKeySchema, to: z.number().int().min(0).max(63) }),
  z.object({ op: z.literal('reroll'), keys: z.array(SpriteFrameKeySchema).min(1).max(SPRITE_PATCH_MAX_OPS) }),
]);
export type SpritePatchOp = z.infer<typeof SpritePatchOpSchema>;
export const SpritePatchFramesRequestSchema = SpriteTargetSchema.extend({ ops: z.array(SpritePatchOpSchema).min(1).max(SPRITE_PATCH_MAX_OPS) });
export type SpritePatchFramesRequest = z.infer<typeof SpritePatchFramesRequestSchema>;
/** `jobId` is set when the patch held a `reroll`. */
export const SpritePatchFramesResultSchema = z.object({ jobId: z.string().optional() });
export type SpritePatchFramesResult = z.infer<typeof SpritePatchFramesResultSchema>;

// --- export (Theme G) ----------------------------------------------------------------

export const SPRITE_PACK_MAX_SIZES = [2048, 4096] as const;

/** How the atlas is packed; every field defaults to the packer's own default. */
export const SpritePackOptionsSchema = z.object({
  maxSize: z.union([z.literal(2048), z.literal(4096)]).default(2048),
  padding: z.number().int().min(0).max(8).default(2),
  extrude: z.union([z.literal(0), z.literal(1)]).default(1),
  pot: z.boolean().default(true),
});
export type SpritePackOptions = z.infer<typeof SpritePackOptionsSchema>;

/**
 * Packs the asset. The atlas is always (re)written to the asset's own `export/` folder (what a game's
 * asset bridge imports); with `dest` it is also written as a `<name>.sprite/` folder there, which is
 * refused when one already exists.
 */
export const SpriteExportRequestSchema = SpriteTargetSchema.extend({
  dest: z.string().min(1).optional(),
  pack: SpritePackOptionsSchema.default({}),
});
export type SpriteExportRequest = z.input<typeof SpriteExportRequestSchema>;
export const SpriteExportResultSchema = z.object({
  /** The pack folder written (`dest`'s, else the asset's `export/`). */
  path: z.string(),
  bytes: z.number().int().nonnegative(),
  frames: z.number().int().nonnegative(),
  pages: z.number().int().nonnegative(),
  warnings: z.array(z.string()).default([]),
});
export type SpriteExportResult = z.infer<typeof SpriteExportResultSchema>;
/** Shown when frames overflow one page (Decision 4). */
export const spriteMultiPageWarning = (pages: number): string => `Split across ${pages} pages; Aseprite tags omitted.`;
export const spritePackExists = (name: string): string => `${name} already exists in that folder.`;
export const SPRITE_NO_FRAMES = 'There are no frames to pack yet. Generate some first.';

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

// --- rendered from 3D (Theme E) ---------------------------------------------------

/** Main → the window (`mediaSpriteRenderRequest`): render these clips of a Models character. */
export const SpriteRenderRequestEventSchema = z.object({
  jobId: z.string(),
  repoId: z.string(),
  /** The Models design: `project` and the `model.json` path inside it. */
  model: z.object({ project: z.string().min(1), path: z.string().min(1) }),
  frameSize: z.tuple([Dim, Dim]),
  /** Direction names, in sheet order. */
  directions: z.array(z.string().min(1)).min(1).max(8),
  settings: SpriteRenderSettingsSchema,
  /** The sprite clips to render (already filtered to a re-generate's `clips`). */
  clips: z.array(SpriteClipSchema).min(1),
});
export type SpriteRenderRequestEvent = z.infer<typeof SpriteRenderRequestEventSchema>;

/** The window → main: "I have the request" — within {@link SPRITE_RENDER_READY_MS}, or the job fails. */
export const SpriteRenderReadyRequestSchema = z.object({ jobId: z.string().min(1) });

export const SpriteRenderedFrameSchema = z.object({
  clip: z.string().min(1),
  dir: z.string().min(1),
  index: z.number().int().min(0).max(999),
  /** Base64 PNG, exactly `frameSize`, real alpha. */
  png: z.string().min(1),
});
export type SpriteRenderedFrame = z.infer<typeof SpriteRenderedFrameSchema>;

/**
 * The window → main: one batch of rendered frames (at most {@link SPRITE_RENDER_BATCH}). Resolves once
 * main has processed the batch — the renderer awaits it before rendering more, which is the
 * back-pressure. A `failed` answer (the job was cancelled) tells the renderer to stop.
 */
export const SpriteRenderFramesRequestSchema = z.object({
  jobId: z.string().min(1),
  frames: z.array(SpriteRenderedFrameSchema).max(SPRITE_RENDER_BATCH),
  /** Frames the whole job will render, so progress has a denominator. */
  total: z.number().int().nonnegative().optional(),
  /** The last batch. */
  done: z.boolean(),
  /** The render failed in the window (no WebGL, an unreadable model…); ends the job with it. */
  error: z.string().max(500).optional(),
  /** Model clips nothing mapped to, and sprite clips with no matching animation — notes for the job. */
  notes: z.array(z.string().max(300)).max(8).optional(),
  /** Sent with the first batch: each rendered clip's frame count and fps (the model clip's length decides them). */
  clips: z.array(z.object({ name: z.string().min(1), frames: z.number().int().min(1).max(64), fps: z.number().min(1).max(60) })).max(32).optional(),
});
export type SpriteRenderFramesRequest = z.infer<typeof SpriteRenderFramesRequestSchema>;

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
  patchFrames: GitOpResultOf(SpritePatchFramesResultSchema),
  export: GitOpResultOf(SpriteExportResultSchema),
  generic: GitOpResultSchema,
} as const;
