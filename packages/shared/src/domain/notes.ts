import { z } from 'zod';

export const NoteStatusSchema = z.enum(['captured', 'planned', 'implemented']);
export type NoteStatus = z.infer<typeof NoteStatusSchema>;

/**
 * A thought or task captured against a repository.
 *
 * Moved to `shared` as a Zod schema in Phase 86 Theme F (Notes on disk).
 * Persisted per-repository under the app's `userData/notes/<repoId>.json`.
 */
export const NoteSchema = z.object({
  id: z.string().min(1),
  repoId: z.string(),
  body: z.string(),
  status: NoteStatusSchema,
  done: z.boolean(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  /**
   * Manual position within the repository's list, ascending — the note the
   * user dragged to the top is the one with the lowest number, whatever its
   * age. Notes were sorted `createdAt` descending before Phase-less ad hoc
   * work gave the list a drag handle, and that sort is still what a fresh
   * repo's numbers encode: `addNote` prepends by taking one below the current
   * minimum.
   */
  order: z.number(),
});
export type Note = z.infer<typeof NoteSchema>;

/**
 * The one notebook Mind keeps (`notes/<id>.json` under Mind's data directory). Shared because the
 * quick capture in Studio's main appends to it without importing Mind.
 */
export const MIND_NOTEBOOK_ID = 'mind';
/** The local notebook a quick capture lands in when Mind is not installed. */
export const INBOX_NOTEBOOK_ID = 'inbox';
