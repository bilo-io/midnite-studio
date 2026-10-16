import { homedir } from 'node:os';
import { join } from 'node:path';

import { resolveWorkdir } from './repo-registry';

/**
 * The path jail for the read-only fs surface (Phase 16). The jail itself —
 * `joinWithin`/`confineToRoot` — is the runtime's since Phase 113 Theme Q.
 *
 * Every path the renderer sends is relative to a scope root — a repository
 * checkout or `~/.claude` — and must still be inside that root after joining,
 * normalising AND resolving symlinks. `..` traversal falls out of `resolve`;
 * a symlink pointing out of the root falls out of `realpath`. Anything that
 * fails confinement resolves to `null`, and the handlers turn that into an
 * ordinary error payload — never a throw across the boundary.
 */

export { confineToRoot, joinWithin } from '@midnite/studio-runtime';

export type FsScopeRequest =
  | { scope: 'repo'; repoId: string; worktreePath?: string | undefined }
  | { scope: 'claude-home' };

/** Overridable for tests; production always means the real `~/.claude`. */
export const claudeHome = (): string => join(homedir(), '.claude');

/**
 * The root a scoped request is confined to. `repo` goes through the registry's
 * `resolveWorkdir`, which already validates a renderer-supplied worktree path
 * against the repo's real worktree list — the same trust boundary every git
 * handler crosses.
 */
export async function resolveScopeRoot(req: FsScopeRequest): Promise<string | null> {
  if (req.scope === 'claude-home') return claudeHome();
  return resolveWorkdir(req.repoId, req.worktreePath);
}
