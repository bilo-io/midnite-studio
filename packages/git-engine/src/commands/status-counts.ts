import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { ChangeCounts, StatusCounts } from '@midnite/git-shared';

import { execGit } from '../exec/git-exec';
import { parseNumstat } from './log';

/**
 * `+n −n` per path for one checkout, both sides of the index.
 *
 * Three reads, all of them cheap and none of them a write: `--cached` for what
 * is staged, the plain diff for the worktree, and `ls-files --others` for the
 * files git has never seen. That last one is the awkward case — an untracked
 * file has no diff at all, so `--numstat` reports nothing for it and the whole
 * Changes list would show `+0 −0` on exactly the rows in the screenshot that
 * prompted this. Counting its lines locally is the only answer that does not
 * involve writing an intent-to-add entry into the user's index.
 */
export async function readStatusCounts(worktreePath: string): Promise<StatusCounts> {
  const [staged, tracked, untracked] = await Promise.all([
    numstat(worktreePath, ['--cached']),
    numstat(worktreePath, []),
    untrackedCounts(worktreePath),
  ]);

  return { staged, unstaged: [...tracked, ...untracked] };
}

/**
 * One `git diff --numstat -z`, reduced to path → counts.
 *
 * Keyed on the POST-image path, because that is what every list in the UI is
 * keyed on — `StatusEntry.path` is the destination of a rename and `origPath`
 * the source, so matching on the source would leave a renamed row at zero.
 */
async function numstat(worktreePath: string, args: readonly string[]): Promise<ChangeCounts[]> {
  const res = await execGit(worktreePath, ['diff', '--numstat', '-z', ...args]);
  if (res.exitCode !== 0) return [];

  return parseNumstat(res.stdout).map((file) => ({
    path: file.path,
    insertions: file.insertions,
    deletions: file.deletions,
  }));
}

/**
 * How large an untracked file we will read to count its lines.
 *
 * A generated asset or a stray build artefact can be hundreds of megabytes, and
 * a number nobody reads is not worth the read. Past this the file reports
 * `+0 −0`, which is the same thing `--numstat` says about a binary — one
 * convention in the UI rather than two.
 */
const MAX_MEASURED_BYTES = 4 * 1024 * 1024;

/** How many at once. Enough to hide the syscall latency, not enough to exhaust fds. */
const READ_CONCURRENCY = 16;

/**
 * Untracked files, as pure insertions.
 *
 * `--exclude-standard` is what keeps this from walking `node_modules`: without
 * it `ls-files --others` enumerates every ignored file in the tree, which is
 * the exact cost `getStatus` avoids by leaving `--ignored=no` alone.
 */
async function untrackedCounts(worktreePath: string): Promise<ChangeCounts[]> {
  const res = await execGit(worktreePath, ['ls-files', '--others', '--exclude-standard', '-z']);
  if (res.exitCode !== 0) return [];

  const paths = res.stdout.split('\x00').filter((p) => p.length > 0);
  const counts: ChangeCounts[] = [];

  for (let i = 0; i < paths.length; i += READ_CONCURRENCY) {
    const batch = await Promise.all(
      paths
        .slice(i, i + READ_CONCURRENCY)
        .map(async (path) => ({ path, insertions: await countLines(join(worktreePath, path)) })),
    );
    for (const entry of batch) counts.push({ ...entry, deletions: 0 });
  }

  return counts;
}

/**
 * Lines in a file, the way `--numstat` counts them: 0 for anything binary.
 *
 * A final line with no trailing newline still counts — git's own "\ No newline
 * at end of file" diff shows it as an added line, and a one-line file reporting
 * `+0` reads as a bug rather than as a subtlety about newlines.
 */
async function countLines(absolutePath: string): Promise<number> {
  try {
    const info = await stat(absolutePath);
    if (!info.isFile() || info.size === 0 || info.size > MAX_MEASURED_BYTES) return 0;

    const buffer = await readFile(absolutePath);
    // The same heuristic git uses to call a blob binary: a NUL byte near the
    // front. Counting "lines" in a png would be a number with no meaning.
    if (buffer.subarray(0, 8000).includes(0)) return 0;

    let lines = 0;
    for (const byte of buffer) if (byte === 0x0a) lines += 1;
    return buffer[buffer.length - 1] === 0x0a ? lines : lines + 1;
  } catch {
    // A path that vanished between `ls-files` and the read is a normal race in
    // a directory somebody is working in, not an error worth propagating.
    return 0;
  }
}
