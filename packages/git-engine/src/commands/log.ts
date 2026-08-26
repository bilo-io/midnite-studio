import type { Commit } from '@midnite/git-shared';

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
 * Resolve a revision to the full 40-char sha of the commit it names.
 *
 * `^{commit}` peels a tag (annotated tags are their own object), so an
 * abbreviated tag sha resolves to something `git show` can actually describe.
 * `--end-of-options` keeps a revision that begins with `-` from being read as an
 * option — belt to the schema's hex-only braces, because this function is
 * exported and the next caller may not validate as tightly.
 *
 * Returns null rather than throwing for a revision this repo does not have: a
 * commit message can reference a sha that was never pushed here, or that a
 * rebase orphaned, and both are ordinary states for a link to be in.
 */
export async function revParse(repoPath: string, rev: string): Promise<string | null> {
  const res = await execGit(repoPath, [
    'rev-parse',
    '--verify',
    '--quiet',
    '--end-of-options',
    `${rev}^{commit}`,
  ]);
  if (res.exitCode !== 0) return null;

  const sha = res.stdout.trim();
  // An ambiguous abbreviation makes `--verify` fail, so anything that got here
  // is a single full sha; the shape check is for the case where it is not.
  return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}

/**
 * Field separator for the commit-detail format string.
 *
 * NUL, like every other parser in this package. The subject and body both
 * contain newlines and arbitrary whitespace, and an author's name may contain
 * anything at all — so the only separator that cannot appear inside a field is
 * the one git itself forbids inside a commit object.
 */
const DETAIL_SEP = '%x00';

/**
 * The fields, in order. `%B` is deliberately LAST: it is the one field that is
 * multi-line by nature, so putting it at the end lets the parser rejoin any
 * surplus tokens into it rather than having to trust that nothing else split.
 */
const DETAIL_FORMAT = ['%H', '%P', '%s', '%an', '%ae', '%at', '%cn', '%ce', '%ct', '%B'].join(
  DETAIL_SEP,
);

export type CommitIdentity = { name: string; email: string; date: number };

export type CommitDetailData = {
  sha: string;
  parents: string[];
  subject: string;
  body: string;
  author: CommitIdentity;
  committer: CommitIdentity;
  files: ReturnType<typeof parseNumstat>;
};

/**
 * Everything the commit inspector shows, for one commit.
 *
 * Two git invocations, not three: the `--stat` call this used to make rendered
 * as a `<pre>` of numbers that the file list beside it already showed, so Phase
 * 12 dropped the field and with it the process that produced it.
 *
 * Returns null when the sha names no commit here. That is not a defensive nicety
 * — the inspector is reachable by clicking a sha linkified out of a commit
 * message, which is attacker-authored text that may reference anything.
 */
export async function readCommitDetail(
  repoPath: string,
  sha: string,
): Promise<CommitDetailData | null> {
  // `--end-of-options` before the revision, as `revParse` does: it stops a
  // revision beginning with `-` from being read as an option. The schema admits
  // only hex today, which makes this belt to those braces — but this function is
  // exported and the next caller may not validate as tightly.
  const [detailRes, numstatRes] = await Promise.all([
    execGit(repoPath, [
      'show',
      '--no-patch',
      `--pretty=format:${DETAIL_FORMAT}`,
      '--end-of-options',
      sha,
    ]),
    // `--numstat -z` gives machine-readable counts with NUL-delimited paths.
    //
    // `-m --first-parent` is what makes a MERGE commit's files visible at all:
    // `git show` prints no diff for a merge by default, so without it every
    // merge reported zero changed files.
    execGit(repoPath, [
      'show',
      '--numstat',
      '-z',
      '-m',
      '--first-parent',
      '--pretty=format:',
      '--end-of-options',
      sha,
    ]),
  ]);

  if (detailRes.exitCode !== 0) return null;
  return parseCommitDetail(detailRes.stdout, numstatRes.stdout);
}

/**
 * Parse the NUL-separated detail record. Exported for its own unit test — the
 * field order and the body-rejoin are the parts worth pinning down.
 */
export function parseCommitDetail(detail: string, numstat: string): CommitDetailData | null {
  const parts = detail.split('\x00');
  // Ten fields; anything shorter is a truncated or empty record, which is what
  // an unresolvable sha produces even on a zero exit in some git versions.
  if (parts.length < 10) return null;

  // Indexed through a helper rather than destructured behind a tuple cast: the
  // cast would assert nine strings on an array the checker knows may hold
  // undefined, which is the assertion most likely to be wrong the day a field
  // is inserted in the wrong place.
  const at = (index: number): string => parts[index] ?? '';

  return {
    sha: at(0),
    // `%P` is space-separated and empty for the root commit, whose split would
    // otherwise yield one empty-string "parent".
    parents: at(1)
      .split(' ')
      .filter((p) => p.length > 0),
    subject: at(2),
    // Anything past the ninth field belongs to `%B`. Rejoined rather than taken
    // as `parts[9]` so a body that somehow contained the separator survives
    // intact instead of being silently truncated at it.
    body: parts.slice(9).join('\x00'),
    author: { name: at(3), email: at(4), date: toUnixSeconds(at(5)) },
    committer: { name: at(6), email: at(7), date: toUnixSeconds(at(8)) },
    files: parseNumstat(numstat),
  };
}

/** `%at`/`%ct` are unix seconds; a malformed one becomes 0, never NaN. */
function toUnixSeconds(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Parse `--numstat -z`: `<ins>\t<del>\t<path>\0`, with renames spending two
 * extra NUL tokens (`<ins>\t<del>\t\0<from>\0<to>`). Binary files report `-`
 * for both counts.
 */
export function parseNumstat(
  payload: string,
): { path: string; oldPath: string | null; insertions: number; deletions: number }[] {
  const tokens = payload.split('\x00').filter((t) => t.length > 0);
  const files: {
    path: string;
    oldPath: string | null;
    insertions: number;
    deletions: number;
  }[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === undefined) continue;
    const parts = token.split('\t');
    if (parts.length < 3) continue;

    const insertions = Number.parseInt(parts[0] ?? '0', 10) || 0;
    const deletions = Number.parseInt(parts[1] ?? '0', 10) || 0;
    let path = parts[2] ?? '';
    let oldPath: string | null = null;

    // Rename: the path field is empty and the next two tokens are from/to.
    //
    // The `from` token is kept, not discarded: a path-scoped diff cannot detect
    // a rename without being told both sides (see commands/diff.ts `pathspec`),
    // so dropping it here is what makes a renamed file render as a whole new
    // file, every line green.
    if (path.length === 0) {
      oldPath = tokens[i + 1] ?? null;
      path = tokens[i + 2] ?? '';
      i += 2;
    }

    if (path.length > 0) files.push({ path, oldPath, insertions, deletions });
  }

  return files;
}
