import { z } from 'zod';

export const RefKindSchema = z.enum(['localBranch', 'remoteBranch', 'tag', 'head']);
export type RefKind = z.infer<typeof RefKindSchema>;

/** Upstream tracking info, from `%(upstream:short)` + `%(upstream:track)`. */
export const UpstreamSchema = z.object({
  /** e.g. `origin/main`. */
  name: z.string(),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  /** `[gone]` — the upstream branch was deleted on the remote. */
  gone: z.boolean().default(false),
});
export type Upstream = z.infer<typeof UpstreamSchema>;

export const RefSchema = z.object({
  /** Display name: `main`, `origin/main`, `v1.2.0`. */
  name: z.string(),
  /** Fully qualified: `refs/heads/main`, `refs/remotes/origin/main`, `refs/tags/v1.2.0`. */
  fullName: z.string(),
  kind: RefKindSchema,
  /**
   * The commit this ref resolves to. For annotated tags this is the *peeled*
   * commit (`%(objectname)` of `refs/tags/x^{}`), not the tag object — the graph
   * joins badges to rows by commit sha.
   */
  sha: z.string(),
  upstream: UpstreamSchema.nullable().default(null),
  /** True when HEAD points at this ref in the currently selected worktree. */
  isHead: z.boolean().default(false),
  /**
   * Set when this branch is checked out in some worktree (`%(worktreepath)`).
   * Git refuses to check the same branch out twice, so the UI greys it out.
   */
  worktreePath: z.string().nullable().default(null),
});
export type Ref = z.infer<typeof RefSchema>;
