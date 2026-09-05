import { z } from 'zod';

/**
 * A single aggregate over `~/.Trash` plus every mounted volume's own Trash
 * (Phase 74 Theme B) — not a list of items, so it gets its own domain file
 * rather than folding into `domain/optimizer.ts`'s `Scan*` shapes, which all
 * carry a `path`/`category`/`ecosystem` this has no use for.
 */
export const TrashSummarySchema = z.object({
  /** Top-level entries across every walked root, summed — Finder's own
   *  definition of "N items in the Trash", not a recursive file count. */
  itemCount: z.number().int().nonnegative(),
  /** A floor, not an exact total: symlinked top-level entries contribute
   *  zero bytes because the underlying walker never follows them. */
  totalBytes: z.number().nonnegative(),
  /** The oldest top-level entry's own `mtime`, ISO-8601. `null` when the
   *  Trash is empty. Not "the date it was moved to the Trash" — macOS does
   *  not reliably expose that. */
  oldestModifiedAt: z.string().nullable(),
  /** Roots actually walked, `~/.Trash` included — so `1` means "no other
   *  disks". */
  volumeCount: z.number().int().nonnegative(),
  /** `true` once the walk's shared entry budget (`MAX_WALK_ENTRIES`) is hit —
   *  `itemCount`/`totalBytes` are then a floor, not an exact total. */
  truncated: z.boolean(),
});
export type TrashSummary = z.infer<typeof TrashSummarySchema>;
