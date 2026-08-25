import { z } from 'zod';

/**
 * A single changed path from `git status --porcelain=v2 -z`.
 *
 * v2 splits state across two independent axes (index vs worktree), so a path can
 * be both staged and unstaged at once — the classic "partially staged" file. The
 * UI shows such a path in both lists, which is why this is one entry with two
 * flags rather than two entries.
 */
export const StatusCodeSchema = z.enum([
  'unmodified',
  'modified',
  'added',
  'deleted',
  'renamed',
  'copied',
  'untracked',
  'ignored',
  'conflicted',
  'typeChanged',
]);
export type StatusCode = z.infer<typeof StatusCodeSchema>;

export const StatusEntrySchema = z.object({
  /** Repo-relative, forward-slashed, already unquoted (`-z` means never quoted). */
  path: z.string(),
  /** Source path of a rename/copy, else null. */
  origPath: z.string().nullable().default(null),
  /** Index-vs-HEAD state. `unmodified` means nothing is staged for this path. */
  staged: StatusCodeSchema,
  /** Worktree-vs-index state. `unmodified` means the worktree matches the index. */
  unstaged: StatusCodeSchema,
  /** True for `u` (unmerged) lines. Both `staged` and `unstaged` read `conflicted`. */
  conflicted: z.boolean().default(false),
  /** Rename/copy similarity score 0–100, from the `R100`/`C75` field. */
  similarity: z.number().int().min(0).max(100).nullable().default(null),
});
export type StatusEntry = z.infer<typeof StatusEntrySchema>;

export const BranchStatusSchema = z.object({
  /** Short branch name, or null on a detached HEAD. */
  head: z.string().nullable(),
  /** Sha HEAD resolves to, or null in an unborn repo (`branch.oid (initial)`). */
  oid: z.string().nullable(),
  upstream: z.string().nullable().default(null),
  ahead: z.number().int().nonnegative().default(0),
  behind: z.number().int().nonnegative().default(0),
  /** True for a fresh repo with no commits yet. */
  unborn: z.boolean().default(false),
  detached: z.boolean().default(false),
});
export type BranchStatus = z.infer<typeof BranchStatusSchema>;

/** A multi-commit operation git has paused mid-way, detected from `.git` state. */
export const InProgressOpSchema = z.enum(['merge', 'rebase', 'cherry-pick', 'revert']);
export type InProgressOp = z.infer<typeof InProgressOpSchema>;

export const StatusResultSchema = z.object({
  branch: BranchStatusSchema,
  entries: z.array(StatusEntrySchema),
  /** null when the worktree is in a normal state. */
  inProgress: InProgressOpSchema.nullable().default(null),
});
export type StatusResult = z.infer<typeof StatusResultSchema>;
