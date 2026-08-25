import { basename } from 'node:path';

import type { Worktree } from '@midnite-git/shared';

/**
 * Parser for `git worktree list --porcelain`.
 *
 * Records are blank-line separated; within a record each line is either
 * `<key> <value>` or a bare flag:
 *
 *   worktree /abs/path
 *   HEAD 0123abc…
 *   branch refs/heads/feature      (absent when detached)
 *   detached                       (bare flag)
 *   bare                           (bare flag — the main repo has no checkout)
 *   locked [reason]
 *   prunable [reason]
 *
 * The FIRST record is always the main worktree — the one owning the real `.git`
 * directory. That ordering is what `isMain` keys on; there's no explicit marker.
 */
export function parseWorktrees(payload: string, repoId: string): Worktree[] {
  const worktrees: Worktree[] = [];

  // Split into records on blank lines, tolerating \r\n and a trailing newline.
  const records = payload.split(/\r?\n\r?\n/).filter((r) => r.trim().length > 0);

  records.forEach((record, index) => {
    let path: string | null = null;
    let headSha: string | null = null;
    let branch: string | null = null;
    let locked = false;
    let prunable = false;

    for (const rawLine of record.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.length === 0) continue;

      const space = line.indexOf(' ');
      const key = space < 0 ? line : line.slice(0, space);
      const value = space < 0 ? '' : line.slice(space + 1);

      switch (key) {
        case 'worktree':
          path = value;
          break;
        case 'HEAD':
          headSha = value;
          break;
        case 'branch':
          // Always fully qualified here; the UI wants the short name.
          branch = value.startsWith('refs/heads/') ? value.slice('refs/heads/'.length) : value;
          break;
        case 'locked':
          locked = true;
          break;
        case 'prunable':
          prunable = true;
          break;
        case 'detached':
          branch = null;
          break;
        case 'bare':
          // A bare main repo has no working tree and no HEAD line.
          break;
        default:
          break;
      }
    }

    if (!path) return;

    worktrees.push({
      id: `${repoId}:${path}`,
      repoId,
      path,
      branch,
      headSha,
      locked,
      isMain: index === 0,
      prunable,
    });
  });

  return worktrees;
}

/** Display label for a worktree row — the directory name, or `main` for the primary. */
export const worktreeLabel = (worktree: Worktree): string =>
  worktree.branch ?? basename(worktree.path);
