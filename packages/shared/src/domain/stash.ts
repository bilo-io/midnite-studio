import { z } from 'zod';

import { GitOpFailureSchema } from './result';

/**
 * One entry from `git stash list`.
 *
 * `parents` is load-bearing, not decoration: a stash commit's `^1` is HEAD at
 * stash time, `^2` is the index state, and `^3` is the untracked files —
 * present only when the stash was made with `-u`. A two-parent and a
 * three-parent stash are different objects, and a reader of all three (the
 * stash diff view) has to be able to tell them apart from this field alone.
 */
export const StashEntrySchema = z.object({
  /** `stash@{n}` — the selector every stash write op takes. */
  selector: z.string(),
  sha: z.string(),
  parents: z.array(z.string()),
  /** `%gs` — e.g. "WIP on main: 1a2b3c4 the commit stashing happened on top of". */
  message: z.string(),
  /** Unix seconds (`%at`). */
  authoredAt: z.number().int(),
  author: z.object({ name: z.string(), email: z.string() }),
});
export type StashEntry = z.infer<typeof StashEntrySchema>;

/**
 * `stashDrop`'s result, widened over the plain `GitOpResult` every other op
 * returns: a drop captures the sha of the commit it just made unreachable, so
 * a later undo (Phase 22 Theme H) has an anchor to `git stash store` back
 * from — a dropped stash is unreachable, not gone. `recoveredSha` is optional
 * because it is populated only when git's own "Dropped …" line could be
 * parsed, and only main ever fills it in.
 */
export const StashDropResultSchema = z.union([
  z.object({ ok: z.literal(true), recoveredSha: z.string().optional() }),
  GitOpFailureSchema,
]);
export type StashDropResult = z.infer<typeof StashDropResultSchema>;

/** One changed file within one part of a stash — same shape `parseNumstat` (git-engine) produces. */
export const StashDiffFileSchema = z.object({
  path: z.string(),
  oldPath: z.string().nullable(),
  insertions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
});
export type StashDiffFile = z.infer<typeof StashDiffFileSchema>;

/**
 * The file list for all three of a stash's parts (Phase 22 Theme D) —
 * `stashDetail`'s answer, read once per stash entry the inspector opens.
 *
 * **Three parts, not one.** `tracked` is `stash@{n}^1..stash@{n}` (the normal
 * working-tree changes); `index` is `stash@{n}^1..stash@{n}^2` (what was
 * staged at stash time) and is empty unless the stash captured a distinct
 * index state; `untracked` is `stash@{n}^3` on its own (a rootless commit, so
 * every file in it is an addition) and is empty unless the stash was made
 * with `-u`. `git stash show -p` only ever answers for `tracked` — reading
 * all three here is the whole reason this type exists rather than reusing
 * `FileDiff`'s own file-list shape.
 */
export const StashDetailSchema = z.object({
  tracked: z.array(StashDiffFileSchema),
  index: z.array(StashDiffFileSchema),
  untracked: z.array(StashDiffFileSchema),
});
export type StashDetail = z.infer<typeof StashDetailSchema>;

/** Which of a stash's three parts a file belongs to — `stashFileDiff`'s own selector. */
export const StashPartSchema = z.enum(['tracked', 'index', 'untracked']);
export type StashPart = z.infer<typeof StashPartSchema>;
