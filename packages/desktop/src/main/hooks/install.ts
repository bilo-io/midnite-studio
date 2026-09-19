import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { getHooksPath } from '@midnite/studio-git-engine';
import { failure, ok, type GitOpResult } from '@midnite/studio-shared';

import { hookScriptPath } from './hook-script-path';

const HOOK_NAME = 'prepare-commit-msg';

/** The line `hookScriptPath()`'s own file carries, so a written file is recognisably ours. */
const MARKER = '# midnite-studio:prepare-commit-msg:v1';

/**
 * Where the hook file belongs for this repo, and whether that location comes
 * from `core.hooksPath` — the installer refuses to touch the default
 * `.git/hooks/` location if a file is already there and it is not ours, but a
 * `core.hooksPath` a user already configured (this very repo's own
 * `.githooks/`, for instance) gets the identical courtesy.
 */
async function resolveHooksDir(repoPath: string): Promise<{ dir: string; usesCoreHooksPath: boolean }> {
  const configured = await getHooksPath(repoPath);
  if (configured !== null) {
    const dir = isAbsolute(configured) ? configured : join(repoPath, configured);
    return { dir, usesCoreHooksPath: true };
  }
  return { dir: join(repoPath, '.git', 'hooks'), usesCoreHooksPath: false };
}

function readIfOurs(target: string): string | null {
  if (!existsSync(target)) return null;
  try {
    return readFileSync(target, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Whether Theme E's hook is installed for this repo right now — read
 * straight off disk, not a preference the app remembers, so the switch can
 * never drift from what a user might have deleted or replaced by hand.
 */
export async function hookStatus(repoPath: string): Promise<GitOpResult<{ installed: boolean }>> {
  const { dir } = await resolveHooksDir(repoPath);
  const contents = readIfOurs(join(dir, HOOK_NAME));
  return ok({ installed: contents !== null && contents.includes(MARKER) });
}

/**
 * Installs `prepare-commit-msg.sh` into this repo's hooks directory.
 *
 * Refuses — rather than overwriting — when a `prepare-commit-msg` already
 * exists there and was not put there by this function: never clobber a
 * user's hook. The failure message carries the exact path so the caller can
 * offer the script's contents to paste in by hand instead.
 */
export async function ensureHookInstalled(repoPath: string): Promise<GitOpResult> {
  const { dir } = await resolveHooksDir(repoPath);
  const target = join(dir, HOOK_NAME);
  const existing = readIfOurs(target);

  if (existing !== null && !existing.includes(MARKER)) {
    return failure(
      `A ${HOOK_NAME} hook already exists at ${target} and was not installed by Midnite ` +
        'Studio. Remove or rename it first, or paste the contents of ' +
        `${hookScriptPath()} into it yourself.`,
    );
  }
  if (existing !== null) {
    // Already ours — idempotent no-op (e.g. the switch was already on).
    return ok();
  }

  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const source = readFileSync(hookScriptPath(), 'utf8');
  writeFileSync(target, source, { mode: 0o755 });
  return ok();
}

/**
 * Removes the hook this function installed, and leaves anything else exactly
 * as it found it — including a pre-existing user hook this function always
 * refused to touch in the first place.
 */
export async function ensureHookRemoved(repoPath: string): Promise<GitOpResult> {
  const { dir } = await resolveHooksDir(repoPath);
  const target = join(dir, HOOK_NAME);
  const existing = readIfOurs(target);

  if (existing === null || !existing.includes(MARKER)) {
    // Not there, or not ours — nothing to do.
    return ok();
  }

  rmSync(target);
  return ok();
}
