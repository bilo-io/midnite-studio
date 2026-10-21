import type { GitOpResult } from '@midnite/studio-shared';
import { conflict, failure, ok } from '@midnite/studio-shared';

import { execGit } from '../exec/git-exec';
import { writeQueue } from '../exec/write-queue';
import { conflictedPaths } from './status';
import { gitErrorLine } from './worktree-ops';

/**
 * `git revert --no-edit <sha>` — a new commit that undoes `sha` (Phase 107
 * Theme M's **Undo turn**). History is never rewritten: the agent's commit
 * stays in the Timeline and the revert sits on top of it.
 *
 * `--end-of-options` keeps a sha that starts with `-` from being read as a
 * flag. A revert that stops on conflicts is the ordinary `conflict('revert')`
 * arm, left in progress so the standard conflict banner (abort / continue)
 * takes over — exactly as a cherry-pick does.
 */
export async function revertCommit(worktreePath: string, sha: string): Promise<GitOpResult> {
  if (!/^[0-9a-f]{4,64}$/i.test(sha)) return failure(`"${sha}" is not a commit id.`);

  const res = await writeQueue.run(worktreePath, () =>
    execGit(worktreePath, ['revert', '--no-edit', '--end-of-options', sha], { write: true, env: { GIT_EDITOR: 'true' } }),
  );
  if (res.exitCode === 0) return ok();

  const files = await conflictedPaths(worktreePath);
  if (files.length > 0) return conflict('revert', files);

  const combined = `${res.stdout}\n${res.stderr}`;
  if (/bad revision|unknown revision|not a valid object name|bad object/i.test(combined)) {
    return failure('That commit is not in this repository.', res.stderr);
  }
  if (/your local changes would be overwritten|commit your changes or stash them/i.test(combined)) {
    return failure('There are uncommitted changes that this undo would overwrite. Commit or discard them first.', res.stderr);
  }
  return failure(gitErrorLine(res.stderr) || gitErrorLine(res.stdout) || 'Could not undo that commit.', res.stderr || res.stdout);
}
