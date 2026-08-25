import { z } from 'zod';

/**
 * A worktree — including the main one. Git models the main checkout as a
 * worktree too (`git worktree list` always lists it first), so the UI can treat
 * "the repo's checkouts" as one uniform list and flag the main one.
 */
export const WorktreeSchema = z.object({
  /** Stable id: `${repoId}:${path}`. Paths are unique per repo by definition. */
  id: z.string(),
  repoId: z.string(),
  path: z.string(),
  /** Short branch name, or null when the worktree is on a detached HEAD. */
  branch: z.string().nullable(),
  /** null only for a brand-new repo with no commits (`worktree list` prints `bare`). */
  headSha: z.string().nullable(),
  locked: z.boolean(),
  /** True for the primary checkout — the one that owns the real `.git` directory. */
  isMain: z.boolean(),
  /** `git worktree list --porcelain` reports a worktree whose directory is gone. */
  prunable: z.boolean().default(false),
});
export type Worktree = z.infer<typeof WorktreeSchema>;

/**
 * An opened repository. `id` is assigned by the main process's repo registry and
 * is what every other IPC call keys on — the renderer never sends paths.
 */
export const RepoDescriptorSchema = z.object({
  id: z.string(),
  /** Absolute path to the main worktree (never a linked worktree, never `.git`). */
  path: z.string(),
  /** Basename of `path`, used as the sidebar label. */
  name: z.string(),
  /** Short name of the branch HEAD points at, or null when detached. */
  headRef: z.string().nullable(),
  worktrees: z.array(WorktreeSchema),
});
export type RepoDescriptor = z.infer<typeof RepoDescriptorSchema>;
