import { z } from 'zod';

/**
 * What changed on disk, classified by the repo watcher so the renderer can
 * invalidate narrowly instead of refetching everything on every fs event.
 *
 * - `refs`     — `refs/**`, `packed-refs`: branch/tag set changed → refs + graph
 * - `head`     — `HEAD` (or a worktree's HEAD): checkout happened → everything
 * - `index`    — `.git/index`: something was staged/unstaged → status
 * - `worktree` — tracked files changed on disk → status
 */
export const WatchKindSchema = z.enum(['refs', 'head', 'index', 'worktree']);
export type WatchKind = z.infer<typeof WatchKindSchema>;

export const WatchEventSchema = z.object({
  repoId: z.string(),
  kind: WatchKindSchema,
  /** Unix millis the debounce window closed. */
  at: z.number().int(),
});
export type WatchEvent = z.infer<typeof WatchEventSchema>;
