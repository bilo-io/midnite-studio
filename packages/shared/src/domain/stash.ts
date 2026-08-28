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
