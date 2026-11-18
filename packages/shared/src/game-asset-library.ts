import { z } from 'zod';

/**
 * The shared asset library (Phase 107 follow-up, unit U1): an on-disk folder outside any game
 * repo holding one folder per collection, each with a `catalog.json`. Read-only on the wire —
 * importing a library asset into a game is a separate op.
 */

/** Default library root when `GamesSettings.assetLibraryRoot` is null. `~` is expanded in main. */
export const DEFAULT_ASSET_LIBRARY_ROOT = '~/GameDev/midnite-assets';

export const GameLibraryAssetKindSchema = z.enum(['model', 'image', 'audio', 'terrain', 'sprite', 'font', 'doc', 'other']);
export type GameLibraryAssetKind = z.infer<typeof GameLibraryAssetKindSchema>;

/** One catalog row. `path` is relative to its collection folder, `/`-separated, never absolute or `..`. */
export const GameLibraryAssetSchema = z.object({
  path: z.string().min(1),
  /** `models/vehicles`, `audio/radio` … ('' when the catalog gave none). */
  category: z.string(),
  /** Where the file was taken from (provenance, free text). */
  source: z.string(),
  bytes: z.number().int().nonnegative(),
  sha256: z.string(),
  /** The manifest's `name`, else the file's base name. */
  name: z.string(),
  kind: GameLibraryAssetKindSchema,
});
export type GameLibraryAsset = z.infer<typeof GameLibraryAssetSchema>;

export const GameLibraryCollectionSchema = z.object({
  /** The folder name under the library root; the collection's id. */
  id: z.string(),
  /** The catalog's `game` (or the folder name). */
  title: z.string(),
  /** `catalog` when a `catalog.json` was read, `walk` when the folder was walked. */
  origin: z.enum(['catalog', 'walk']),
  assets: z.array(GameLibraryAssetSchema),
  totalBytes: z.number().int().nonnegative(),
  /** Set when a catalog.json existed but was unreadable and the walk was used instead. */
  warning: z.string().nullable(),
});
export type GameLibraryCollection = z.infer<typeof GameLibraryCollectionSchema>;

export const GameLibraryListingSchema = z.object({
  /** The absolute, resolved root that was listed. */
  root: z.string(),
  /** False when the root does not exist (an empty listing, not an error). */
  exists: z.boolean(),
  collections: z.array(GameLibraryCollectionSchema),
});
export type GameLibraryListing = z.infer<typeof GameLibraryListingSchema>;

/** Read one library file for preview. Confined to the library root in main. */
export const GameLibraryReadRequestSchema = z.object({
  collection: z.string().min(1),
  path: z.string().min(1),
});
export type GameLibraryReadRequest = z.infer<typeof GameLibraryReadRequestSchema>;

export const GameLibraryFileSchema = z.object({
  /** Absolute resolved path (for "reveal"/import by a later unit). */
  absolutePath: z.string(),
  mime: z.string(),
  bytes: z.number().int().nonnegative(),
  /** A `data:` URL for image/audio up to the preview cap; null when larger or not previewable. */
  dataUrl: z.string().nullable(),
});
export type GameLibraryFile = z.infer<typeof GameLibraryFileSchema>;

/** Largest file inlined as a data URL for preview. */
export const GAME_LIBRARY_PREVIEW_MAX_BYTES = 12 * 1024 * 1024;
