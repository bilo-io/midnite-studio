/**
 * Media ▸ Animations (Phase 125) — a library of animation clips (Mixamo first).
 *
 * The library is **global**: it lives under the user's app-data directory (`<userData>/animation-library`),
 * shared across every repo, with one manifest of clips — name, tags, duration, source/site, licence, author,
 * original URL, sha256, file path. A game takes a clip into its own `assets/` through the asset-import path
 * (Theme G); nothing here writes into a repo.
 *
 * One IPC channel carries every op (`AnimationRequestSchema`, the `mediaSfx` shape), each answering the
 * `GitOpResult` envelope; a bulk import reports progress on one event channel.
 *
 * Imports `zod` and one sibling: this is the wire contract, nothing more.
 */
import { z } from 'zod';

/** `<userData>/animation-library/animations.manifest.json` — the index of every clip. */
export const ANIMATION_MANIFEST_FILE = 'animations.manifest.json';
/** Clip files sit in this folder of the library root, named `<id>-<slug>.<ext>`. */
export const ANIMATION_FILES_DIR = 'clips';

/** The file types a clip can be imported as. FBX is what Mixamo hands out. */
export const ANIMATION_FORMATS = ['fbx', 'glb', 'gltf', 'bvh'] as const;
export const AnimationFormatSchema = z.enum(ANIMATION_FORMATS);
export type AnimationFormat = z.infer<typeof AnimationFormatSchema>;
/** Lower-case extensions an import picks up. */
export const ANIMATION_EXTENSIONS: readonly string[] = ANIMATION_FORMATS.map((f) => `.${f}`);

/** Where a clip came from. `local` is a file the user already had. */
export const ANIMATION_SOURCES = [
  'mixamo',
  'sketchfab',
  'quaternius',
  'polypizza',
  'opengameart',
  'actorcore',
  'cmu',
  'turbosquid',
  'cgtrader',
  'local',
  'other',
] as const;
export const AnimationSourceSchema = z.enum(ANIMATION_SOURCES);
export type AnimationSource = z.infer<typeof AnimationSourceSchema>;

export const ANIMATION_SOURCE_LABELS: Record<AnimationSource, string> = {
  mixamo: 'Mixamo',
  sketchfab: 'Sketchfab',
  quaternius: 'Quaternius',
  polypizza: 'Poly Pizza',
  opengameart: 'OpenGameArt',
  actorcore: 'ActorCore',
  cmu: 'CMU mocap',
  turbosquid: 'TurboSquid',
  cgtrader: 'CGTrader',
  local: 'Local file',
  other: 'Other',
};

/**
 * A small known set of licences. An import with no known licence is `unknown` — never silently
 * permissive (Phase 125 Decision 11). `mixamo-eula` is Adobe's: free with an Adobe ID, royalty-free in a
 * product, but the clips themselves may not be redistributed as a library.
 */
export const ANIMATION_LICENCES = ['cc0', 'cc-by', 'cc-by-sa', 'cc-by-nc', 'mixamo-eula', 'custom', 'unknown'] as const;
export const AnimationLicenceSchema = z.enum(ANIMATION_LICENCES);
export type AnimationLicence = z.infer<typeof AnimationLicenceSchema>;

export const ANIMATION_LICENCE_LABELS: Record<AnimationLicence, string> = {
  cc0: 'CC0 (public domain)',
  'cc-by': 'CC BY (attribution)',
  'cc-by-sa': 'CC BY-SA',
  'cc-by-nc': 'CC BY-NC (non-commercial)',
  'mixamo-eula': 'Mixamo (Adobe terms)',
  custom: 'Custom terms',
  unknown: 'Unknown',
};

/** Licences that ask for credit; the game import (Theme G) names them in its confirm. */
export const ANIMATION_ATTRIBUTION_LICENCES: readonly AnimationLicence[] = ['cc-by', 'cc-by-sa', 'cc-by-nc'];

/** The tags the importer assigns on its own; a user's own tags are free-form within `AnimationTagSchema`. */
export const ANIMATION_TAG_IDS = ['locomotion', 'traversal', 'combat', 'reaction', 'idle', 'emote', 'interaction'] as const;
export type AnimationTagId = (typeof ANIMATION_TAG_IDS)[number];

export const AnimationTagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{0,31}$/, 'A tag is lower-case letters, digits and dashes');

/** The most tags one clip carries. */
export const ANIMATION_MAX_TAGS = 16;

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

/** A clip's id is the first 12 hex digits of its sha256, so the same bytes are the same clip. */
export const AnimationIdSchema = z.string().regex(/^[a-f0-9]{12}$/);

const HttpUrlSchema = z
  .string()
  .max(2000)
  .refine((value) => {
    try {
      const { protocol } = new URL(value);
      return protocol === 'https:' || protocol === 'http:';
    } catch {
      return false;
    }
  }, 'An http(s) URL');

/** One clip in the manifest. Every field past the core has a default, so an older manifest still loads. */
export const AnimationClipSchema = z.object({
  id: AnimationIdSchema,
  name: z.string().trim().min(1).max(120),
  tags: z.array(AnimationTagSchema).max(ANIMATION_MAX_TAGS).default([]),
  /** Seconds, or `null` when the file's duration could not be read (an ASCII FBX, say). */
  durationSec: z.number().min(0).nullable().default(null),
  frameCount: z.number().int().min(0).optional(),
  fps: z.number().positive().optional(),
  boneCount: z.number().int().min(0).optional(),
  /** Whether the file carries a mesh and skin (Mixamo's "With Skin") rather than the motion alone. */
  hasSkin: z.boolean().default(false),
  format: AnimationFormatSchema,
  source: AnimationSourceSchema.default('local'),
  /** The site's host or name, when it is not one of the known sources. */
  site: z.string().max(120).optional(),
  licence: AnimationLicenceSchema.default('unknown'),
  author: z.string().max(120).default(''),
  originalUrl: HttpUrlSchema.optional(),
  sha256: Sha256Schema,
  /** Relative to the library root, forward slashes, always under {@link ANIMATION_FILES_DIR}. */
  file: z.string().min(1).max(300),
  sizeBytes: z.number().int().min(0),
  /** Epoch milliseconds. */
  addedAt: z.number().int().min(0),
});
export type AnimationClip = z.infer<typeof AnimationClipSchema>;

export const AnimationManifestSchema = z.object({
  version: z.literal(1).default(1),
  clips: z.array(AnimationClipSchema).default([]),
});
export type AnimationManifest = z.infer<typeof AnimationManifestSchema>;

/** The fields the detail pane may change. Everything else is the file's, and is read-only. */
export const AnimationPatchSchema = z.object({
  name: AnimationClipSchema.shape.name.optional(),
  tags: z.array(AnimationTagSchema).max(ANIMATION_MAX_TAGS).optional(),
  licence: AnimationLicenceSchema.optional(),
  author: z.string().max(120).optional(),
  source: AnimationSourceSchema.optional(),
  site: z.string().max(120).optional(),
  originalUrl: HttpUrlSchema.optional(),
});
export type AnimationPatch = z.infer<typeof AnimationPatchSchema>;

/** The largest file a drag-drop import or a `read` moves over IPC (base64 triples that on the wire). */
export const ANIMATION_MAX_FILE_BYTES = 128 * 1024 * 1024;

export const AnimationRequestSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('list') }),
  /** Opens the native file picker, then imports the picked files. */
  z.object({ op: z.literal('importFiles') }),
  /** Opens the native folder picker, then imports every clip file under it (depth ≤ 4). */
  z.object({ op: z.literal('importFolder') }),
  /** A dropped file: the renderer holds its bytes, never its path. */
  z.object({
    op: z.literal('importBytes'),
    name: z.string().min(1).max(260),
    dataBase64: z.string().min(1),
    /** The folder a dropped directory entry sat in, for naming and tagging. */
    folder: z.string().max(260).optional(),
  }),
  z.object({ op: z.literal('update'), id: AnimationIdSchema, patch: AnimationPatchSchema }),
  z.object({ op: z.literal('remove'), id: AnimationIdSchema }),
  /** The clip's bytes, base64, for the timeline player (Theme D). */
  z.object({ op: z.literal('read'), id: AnimationIdSchema }),
]);
export type AnimationRequest = z.infer<typeof AnimationRequestSchema>;

export const AnimationListResultSchema = z.object({ clips: z.array(AnimationClipSchema) });
export type AnimationListResult = z.infer<typeof AnimationListResultSchema>;

export const AnimationImportFailureSchema = z.object({ name: z.string(), reason: z.string() });
export type AnimationImportFailure = z.infer<typeof AnimationImportFailureSchema>;

/** What an import did: new clips, files already in the library, and the ones that could not be read. */
export const AnimationImportResultSchema = z.object({
  added: z.array(AnimationClipSchema),
  duplicates: z.array(AnimationClipSchema),
  failed: z.array(AnimationImportFailureSchema),
  /** Files that were read but only partly understood (an unreadable duration, say). */
  warnings: z.array(z.string()).default([]),
  /** The picker was dismissed: nothing was imported and nothing failed. */
  cancelled: z.boolean().default(false),
});
export type AnimationImportResult = z.infer<typeof AnimationImportResultSchema>;

export const AnimationClipResultSchema = z.object({ clip: AnimationClipSchema });
export type AnimationClipResult = z.infer<typeof AnimationClipResultSchema>;

export const AnimationReadResultSchema = z.object({
  id: AnimationIdSchema,
  name: z.string(),
  format: AnimationFormatSchema,
  dataBase64: z.string(),
});
export type AnimationReadResult = z.infer<typeof AnimationReadResultSchema>;

/** The library changed (an import landed, a clip was edited or removed): refetch the list. */
export const AnimationChangedEventSchema = z.object({
  reason: z.enum(['import', 'update', 'remove']),
  count: z.number().int().min(0),
});
export type AnimationChangedEvent = z.infer<typeof AnimationChangedEventSchema>;

/** A bulk import's progress. `done` of `total` files are finished; `current` is the one being read. */
export const AnimationProgressEventSchema = z.object({
  done: z.number().int().min(0),
  total: z.number().int().min(0),
  current: z.string().optional(),
  finished: z.boolean().default(false),
});
export type AnimationProgressEvent = z.infer<typeof AnimationProgressEventSchema>;

/** The slug a clip file is named with: lower-case, dashes, ASCII, never empty. */
export function animationSlug(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  return slug || 'clip';
}

/** Seconds as `m:ss.cc`, or an em dash when the duration is unknown. */
export function formatAnimationDuration(durationSec: number | null | undefined): string {
  if (durationSec === null || durationSec === undefined || !Number.isFinite(durationSec)) return '—';
  const centis = Math.round(Math.max(0, durationSec) * 100);
  const minutes = Math.floor(centis / 6000);
  const seconds = Math.floor((centis % 6000) / 100);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centis % 100).padStart(2, '0')}`;
}
