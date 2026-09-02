import type { ReflogEntry } from '@midnite/studio-shared';

import { execGit } from '../exec/git-exec';
import { parseReflogList, REFLOG_FORMAT } from '../parsers/reflog-parser';

export type ReflogOptions = {
  /** Absent means `HEAD`. */
  ref?: string;
  limit?: number;
};

/**
 * `git reflog show`, for the History view (Phase 22 Theme G).
 *
 * Requests `limit + 1` records and returns `limit` — the extra one is never
 * handed back, but its sha is what lets the returned page's OLDEST entry
 * still carry a real `oldSha` rather than `null` purely because the page cut
 * off there. See `parseReflogList`'s own doc for the pairing.
 */
export async function readReflog(
  worktreePath: string,
  options: ReflogOptions = {},
): Promise<ReflogEntry[]> {
  const { ref = 'HEAD', limit = 200 } = options;

  const res = await execGit(worktreePath, [
    'reflog',
    'show',
    '--date=unix',
    '-z',
    `--format=${REFLOG_FORMAT}`,
    `--max-count=${limit + 1}`,
    ref,
  ]);
  if (res.exitCode !== 0) return [];

  return parseReflogList(res.stdout).slice(0, limit);
}
