import type { Commit } from '@midnite-git/shared';

import { execGit, spawnGit } from '../exec/git-exec';
import { LOG_FORMAT, chunkRecords, parseLog, parseLogRecord } from '../parsers/log-parser';

export type LogOptions = {
  /** Hard cap on commits walked. */
  limit?: number;
  /** Walk every ref, not just HEAD — what the graph wants. */
  all?: boolean;
  /** Extra revision arguments (e.g. a single branch). */
  revisions?: readonly string[];
};

/**
 * The argv shared by the buffered and streaming readers.
 *
 * `--topo-order` is not optional. The lane layout assumes a child is always
 * emitted before its parents and that a branch's commits arrive contiguously;
 * the default (`--date-order`) interleaves branches whose dates overlap, which
 * makes lanes flicker between rows. `--date-order` is faster but produces a
 * graph that doesn't match what `git log --graph` draws.
 *
 * `--decorate=full` keeps ref names fully qualified so `origin/main` can't be
 * mistaken for a local `main`.
 */
export function buildLogArgs(options: LogOptions = {}): string[] {
  const args = [
    'log',
    '--topo-order',
    '--decorate=full',
    `--pretty=format:${LOG_FORMAT}`,
    '-z',
  ];
  if (options.all) args.push('--all');
  if (options.limit !== undefined) args.push(`-n${options.limit}`);
  if (options.revisions?.length) args.push(...options.revisions);
  return args;
}

/** Read the whole log into memory. Fine for tests and small ranges. */
export async function readLog(repoPath: string, options: LogOptions = {}): Promise<Commit[]> {
  const res = await execGit(repoPath, buildLogArgs(options));
  // An unborn repo has no HEAD: `log` exits 128 with "does not have any commits
  // yet". That's an empty graph, not an error.
  if (res.exitCode !== 0) return [];
  return parseLog(res.stdout);
}

export type LogStream = {
  /** Resolves when git exits and every buffered record has been emitted. */
  readonly done: Promise<{ total: number; error?: string }>;
  /** Kill the git process — used when the user switches repo mid-stream. */
  cancel(): void;
};

/**
 * Walk history incrementally, invoking `onBatch` as commits arrive.
 *
 * Buffered reads don't work at this scale: a large repo's log is tens of
 * megabytes and takes seconds to produce, during which the UI would show
 * nothing. Streaming lets the first screenful render almost immediately while
 * git is still walking.
 *
 * The chunk-boundary problem is the reason `chunkRecords` exists: a pipe hands
 * over bytes at arbitrary offsets, routinely mid-subject. Each chunk is
 * appended to a carry-over remainder, whole records are peeled off, and the
 * partial tail waits for the next chunk.
 */
export function streamLog(
  repoPath: string,
  options: LogOptions,
  onBatch: (commits: Commit[]) => void,
  batchSize = 500,
): LogStream {
  const child = spawnGit(repoPath, buildLogArgs(options));

  let remainder = '';
  let pending: Commit[] = [];
  let total = 0;
  let stderr = '';
  let cancelled = false;

  const flush = (): void => {
    if (pending.length === 0) return;
    const batch = pending;
    pending = [];
    onBatch(batch);
  };

  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => {
    const { records, remainder: tail } = chunkRecords(remainder + chunk);
    remainder = tail;

    for (const record of records) {
      const commit = parseLogRecord(record);
      if (!commit) continue;
      pending.push(commit);
      total += 1;
      if (pending.length >= batchSize) flush();
    }
  });

  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => {
    // Cap it — a pathological failure shouldn't buffer megabytes of stderr.
    if (stderr.length < 8192) stderr += chunk;
  });

  const done = new Promise<{ total: number; error?: string }>((resolve) => {
    const finish = (code: number | null): void => {
      // A trailing whole record can still be sitting in the remainder: with
      // `--pretty=format:` git separates records rather than terminating them,
      // so the last one arrives without a trailing NUL.
      const last = parseLogRecord(remainder);
      if (last) {
        pending.push(last);
        total += 1;
      }
      remainder = '';
      flush();

      if (cancelled || code === 0 || total > 0) {
        resolve({ total });
      } else {
        resolve({ total, error: stderr.trim() || `git log exited with ${code}` });
      }
    };

    child.on('close', finish);
    child.on('error', (err: Error) => {
      stderr += err.message;
      finish(-1);
    });
  });

  return {
    done,
    cancel: () => {
      cancelled = true;
      child.kill();
    },
  };
}

/**
 * `git show --stat` for the commit detail pane, plus a parsed per-file summary.
 */
export async function readCommitDetail(
  repoPath: string,
  sha: string,
): Promise<{ sha: string; body: string; stat: string; files: { path: string; insertions: number; deletions: number }[] }> {
  const [bodyRes, statRes, numstatRes] = await Promise.all([
    execGit(repoPath, ['show', '--no-patch', '--pretty=format:%B', sha]),
    execGit(repoPath, ['show', '--stat', '--pretty=format:', sha]),
    // `--numstat -z` gives machine-readable counts with NUL-delimited paths.
    execGit(repoPath, ['show', '--numstat', '-z', '--pretty=format:', sha]),
  ]);

  return {
    sha,
    body: bodyRes.stdout,
    stat: statRes.stdout.trim(),
    files: parseNumstat(numstatRes.stdout),
  };
}

/**
 * Parse `--numstat -z`: `<ins>\t<del>\t<path>\0`, with renames spending two
 * extra NUL tokens (`<ins>\t<del>\t\0<from>\0<to>`). Binary files report `-`
 * for both counts.
 */
export function parseNumstat(payload: string): { path: string; insertions: number; deletions: number }[] {
  const tokens = payload.split('\x00').filter((t) => t.length > 0);
  const files: { path: string; insertions: number; deletions: number }[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === undefined) continue;
    const parts = token.split('\t');
    if (parts.length < 3) continue;

    const insertions = Number.parseInt(parts[0] ?? '0', 10) || 0;
    const deletions = Number.parseInt(parts[1] ?? '0', 10) || 0;
    let path = parts[2] ?? '';

    // Rename: the path field is empty and the next two tokens are from/to.
    if (path.length === 0) {
      path = tokens[i + 2] ?? '';
      i += 2;
    }

    if (path.length > 0) files.push({ path, insertions, deletions });
  }

  return files;
}
