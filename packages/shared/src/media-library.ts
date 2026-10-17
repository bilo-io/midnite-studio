/**
 * Media ▸ Library (Phase 113 Theme R) — the wire contract for the local media library: the folders a
 * user picked (roots), what a scan found in them (films, shows, music, photos), the watch progress kept
 * per item, and the library's own settings.
 *
 * The library never copies a file. An item is a path inside one root, and its bytes reach the renderer
 * over the existing `mstudio-file:` scheme on the `library` host — `mstudio-file://library/<rootId>/<relPath>`
 * — which main resolves through the runtime's path jail against that root alone (a `..`, an absolute path
 * or a symlink out of the root answers 404). Artwork a scan pulled out of a file (an MP3's embedded cover)
 * or fetched from the opt-in online provider is cached under the library's own data directory and served
 * on the reserved root id `art`.
 *
 * **Nothing leaves the machine by default.** `onlineMetadata` is off until the user turns it on, and even
 * then the provider's key is read in main from the vault; the renderer is only told whether one is set.
 */
import { z } from 'zod';

import { MSTUDIO_FILE_SCHEME } from './fs';

// --- kinds and roots -----------------------------------------------------------

/** What a scan classifies a file as. Order is the explorer's order. */
export const LIBRARY_KINDS = ['film', 'show', 'music', 'photo'] as const;
export const LibraryKindSchema = z.enum(LIBRARY_KINDS);
export type LibraryKind = z.infer<typeof LibraryKindSchema>;

export const LIBRARY_KIND_LABELS: Record<LibraryKind, string> = {
  film: 'Films',
  show: 'Shows',
  music: 'Music',
  photo: 'Photos',
};

/** The `mstudio-file:` host library bytes are served on. */
export const LIBRARY_FILE_HOST = 'library';
/** The reserved root id cached artwork is served from (`<dataDir>/art/`). A real root's id is `r<hex>`. */
export const LIBRARY_ART_ROOT_ID = 'art';
/** A real root's id: `r` + hex, so it can never be {@link LIBRARY_ART_ROOT_ID}. */
export const LibraryRootIdSchema = z.string().regex(/^r[0-9a-f]{8,32}$/);

export const LibraryRootSchema = z.object({
  id: LibraryRootIdSchema,
  /** The absolute folder the user picked — main's, shown in the explorer so the user knows which it is. */
  path: z.string().min(1),
  /** The folder's name. */
  label: z.string(),
  addedAt: z.number(),
  lastScanAt: z.number().nullable(),
  itemCount: z.number().int().nonnegative(),
});
export type LibraryRoot = z.infer<typeof LibraryRootSchema>;

/** A file the renderer may load: a path inside one root (or the art cache). */
export const LibraryFileRefSchema = z.object({
  rootId: z.union([LibraryRootIdSchema, z.literal(LIBRARY_ART_ROOT_ID)]),
  path: z.string().min(1),
});
export type LibraryFileRef = z.infer<typeof LibraryFileRefSchema>;

// --- items -----------------------------------------------------------------------

export const LibraryProgressSchema = z.object({
  positionS: z.number().nonnegative(),
  durationS: z.number().nonnegative(),
  /** Past {@link LIBRARY_FINISHED_FRACTION} of the runtime, or ended. */
  finished: z.boolean(),
  updatedAt: z.number(),
});
export type LibraryProgress = z.infer<typeof LibraryProgressSchema>;

/** Watched this far through, an item counts as finished and leaves Continue watching. */
export const LIBRARY_FINISHED_FRACTION = 0.92;
/** Less than this far in, a play is not worth resuming (an accidental open). */
export const LIBRARY_RESUME_MIN_S = 30;

export const LibraryItemSchema = z.object({
  /** Stable across rescans: a hash of the root id and the relative path. */
  id: z.string().min(1),
  kind: LibraryKindSchema,
  rootId: LibraryRootIdSchema,
  /** Relative to the root, `/`-separated. */
  path: z.string().min(1),
  title: z.string(),
  year: z.number().int().nullable(),
  /** Shows: the series, and where in it this episode sits. */
  showTitle: z.string().nullable(),
  season: z.number().int().nullable(),
  episode: z.number().int().nullable(),
  /** Music: from the file's tags when it has them, else the folders above it. */
  artist: z.string().nullable(),
  album: z.string().nullable(),
  track: z.number().int().nullable(),
  plot: z.string().nullable(),
  art: LibraryFileRefSchema.nullable(),
  /** Where the title, plot and art came from. */
  source: z.enum(['local', 'online']),
  size: z.number().int().nonnegative(),
  mtimeMs: z.number(),
  progress: LibraryProgressSchema.nullable(),
});
export type LibraryItem = z.infer<typeof LibraryItemSchema>;

// --- settings ---------------------------------------------------------------------

/** The online metadata providers the library knows. Off unless `onlineMetadata` is on. */
export const LIBRARY_ONLINE_PROVIDERS = ['tmdb'] as const;
export const LibraryOnlineProviderSchema = z.enum(LIBRARY_ONLINE_PROVIDERS);

export const LibrarySettingsSchema = z.object({
  /** Off by default: with it off the library makes no network request at all. */
  onlineMetadata: z.boolean(),
  onlineProvider: LibraryOnlineProviderSchema,
});
export type LibrarySettings = z.infer<typeof LibrarySettingsSchema>;

export const DEFAULT_LIBRARY_SETTINGS: LibrarySettings = { onlineMetadata: false, onlineProvider: 'tmdb' };

// --- events -----------------------------------------------------------------------

export const LibraryScanSummarySchema = z.object({
  scanned: z.number().int().nonnegative(),
  added: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
  /** Files a scan could not read (permissions, a vanished file) — counted, never fatal. */
  skipped: z.number().int().nonnegative(),
});
export type LibraryScanSummary = z.infer<typeof LibraryScanSummarySchema>;

export const LibraryScanProgressSchema = z.object({
  phase: z.enum(['scanning', 'done', 'error']),
  rootId: LibraryRootIdSchema.nullable(),
  scanned: z.number().int().nonnegative(),
  message: z.string().optional(),
});
export type LibraryScanProgress = z.infer<typeof LibraryScanProgressSchema>;

/** Sent whenever roots, items or progress changed, so every open view refetches. */
export const LibraryChangedSchema = z.object({ reason: z.enum(['roots', 'scan', 'progress', 'settings']) });
export type LibraryChanged = z.infer<typeof LibraryChangedSchema>;

// --- requests ---------------------------------------------------------------------

export const LibraryRootsResponseSchema = z.object({ roots: z.array(LibraryRootSchema) });
export const LibraryRemoveRootRequestSchema = z.object({ rootId: LibraryRootIdSchema });
export const LibraryScanRequestSchema = z.object({ rootId: LibraryRootIdSchema.optional() });
export const LibraryItemsRequestSchema = z.object({ kind: LibraryKindSchema.optional() });
export const LibraryItemsResponseSchema = z.object({ items: z.array(LibraryItemSchema) });
export const LibraryProgressRequestSchema = z.object({
  itemId: z.string().min(1),
  positionS: z.number().nonnegative(),
  durationS: z.number().nonnegative(),
  /** True when playback ran to the end. */
  ended: z.boolean().optional(),
});
export const LibraryClearProgressRequestSchema = z.object({ itemId: z.string().min(1) });
export const LibrarySettingsResponseSchema = z.object({
  settings: LibrarySettingsSchema,
  /** Whether the online provider's key is set and readable by this app — never the key. */
  onlineKeyAvailable: z.boolean(),
});

// --- helpers ----------------------------------------------------------------------

/** `mstudio-file://library/<rootId>/<relPath>` — each segment encoded (names hold spaces, `#`, `?`). */
export function libraryFileUrl(ref: LibraryFileRef): string {
  const segments = ref.path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${MSTUDIO_FILE_SCHEME}://${LIBRARY_FILE_HOST}/${encodeURIComponent(ref.rootId)}/${segments}`;
}

/** Where a play should resume from: nowhere when barely started or already finished. */
export function libraryResumeAt(progress: LibraryProgress | null): number {
  if (!progress || progress.finished || progress.positionS < LIBRARY_RESUME_MIN_S) return 0;
  return progress.positionS;
}

/** Whether a position counts as finished. */
export function libraryIsFinished(positionS: number, durationS: number, ended = false): boolean {
  if (ended) return true;
  return durationS > 0 && positionS / durationS >= LIBRARY_FINISHED_FRACTION;
}
