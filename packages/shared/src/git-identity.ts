/**
 * The machine-wide git identity (Phase 98 Theme F) — `git config --global
 * user.name` / `user.email`, the pair every commit is authored under unless a
 * repo overrides it.
 *
 * Global, not per-repo: this is the one git setting the setup wizard writes,
 * and it lives in `~/.gitconfig`, which no repo owns. Both ops answer with the
 * `GitOpResult` envelope, so a read-only home or a missing git is an ordinary
 * outcome the page renders, never a throw across the boundary.
 */
import { z } from 'zod';

import { GitOpResultOf } from './domain/result';

export const GitIdentitySchema = z.object({
  /** Empty when unset — an unset identity is data, not an error. */
  name: z.string(),
  email: z.string(),
});
export type GitIdentity = z.infer<typeof GitIdentitySchema>;

/** Deliberately loose: one `@`, no whitespace, no angle brackets (git rejects those in an ident). */
export const GIT_EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+$/;

export const GitIdentitySetRequest = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().max(320).regex(GIT_EMAIL_PATTERN),
});

export const GitIdentityGetResponse = GitOpResultOf(GitIdentitySchema);
export const GitIdentitySetResponse = GitOpResultOf(GitIdentitySchema);

/** The least an account card contributes to the identity form. */
export type IdentityAccount = { login: string; displayName: string; email?: string | null };

/**
 * What the identity form shows for a selected account.
 *
 * Name: the account's display name, then its login, then what git already has.
 * Email: the forge's email when it gave one (`/user` only returns a *public*
 * email), then what git already has, then empty — never a guess, because a
 * wrong email is committed into history.
 */
export function prefillGitIdentity(account: IdentityAccount | null, current: GitIdentity): GitIdentity {
  if (!account) return current;
  return {
    name: account.displayName.trim() || account.login || current.name,
    email: account.email?.trim() || current.email,
  };
}
