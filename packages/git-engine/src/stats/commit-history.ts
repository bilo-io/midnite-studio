import { execGit } from '../exec/git-exec';

/**
 * The one history traversal every statistic is derived from.
 *
 * **One pass, many aggregations.** The calendar, the contributor table, the
 * activity feed and churn are four foldings of the same commit stream, not four
 * reasons to shell out. On a repository with real history the traversal is the
 * entire cost — the arithmetic afterwards is free — so running it four times
 * would make the dashboard four times slower for no additional information.
 *
 * **Churn is opt-in**, because `--numstat` is the expensive half. It makes git
 * diff every commit against its parent rather than just read the commit
 * objects, which on a large repository dominates everything else. A dashboard
 * showing no churn widget should not pay for it, so the caller asks.
 *
 * NUL-delimited throughout, per the repo-wide rule: commit subjects contain
 * newlines and author names contain spaces, so any whitespace-based split is a
 * parser that works until someone writes a multi-line commit message.
 */

/** One commit, as the aggregators consume it. */
export type HistoryCommit = {
  sha: string;
  /** Unix **seconds**, UTC, exactly as `%at` gives it. Bucketed later. */
  at: number;
  authorName: string;
  authorEmail: string;
  subject: string;
  /** Absent unless churn was requested. */
  files?: FileChange[];
};

export type FileChange = {
  path: string;
  /** Null for a binary file — `--numstat` prints `-` rather than a count. */
  insertions: number | null;
  deletions: number | null;
};

/**
 * Record separator and field separator.
 *
 * A commit record is introduced by a sentinel rather than delimited by `-z`
 * alone, because `--numstat` interleaves plain-text file lines between commit
 * records and there is no way to tell a file line from a subject line without
 * one. The sentinel is a control character that cannot appear in a path, an
 * author name or a subject.
 */
const RECORD = '\x1e';
const FIELD = '\x00';

/**
 * The pretty format, exported so the command and the parser cannot disagree
 * about field order — the classic break is someone adding a field and every
 * later one silently shifting by one. Mirrors `LOG_FORMAT` in log-parser.ts.
 *
 * Order: sha, author date, author name, author email, subject.
 */
export const HISTORY_FORMAT = `${RECORD}%H%x00%at%x00%aN%x00%aE%x00%s`;

const FIELD_COUNT = 5;

export type HistoryOptions = {
  /** ISO date or git approxidate. Omitted means the whole history. */
  since?: string;
  /** Stop after this many commits and report `truncated`. */
  maxCommits: number;
  /** Ask for `--numstat`. Off by default — see the note above. */
  withChurn?: boolean;
};

export type HistoryResult = {
  commits: HistoryCommit[];
  /** The cap or the budget stopped the walk before history ran out. */
  truncated: boolean;
};

/**
 * Build the argv. Separate from running it so the flags are assertable without
 * a repository — the `gh-cli.ts` split between command construction and spawn.
 */
export function historyArgs(options: HistoryOptions): string[] {
  const args = [
    'log',
    // Every ref, not just HEAD: a contributor table that omits everyone whose
    // work sits on a branch is a contributor table that is wrong.
    '--all',
    // Author identities pass through .mailmap. `%aN`/`%aE` respect it and the
    // flag has shipped since git 1.8.2 — with dugite bundling the binary there
    // is no older git to degrade to, so there is nothing to probe for.
    '--use-mailmap',
    `--pretty=format:${HISTORY_FORMAT}`,
    // One extra so the caller can tell "exactly at the cap" from "more to come".
    `--max-count=${options.maxCommits + 1}`,
  ];
  if (options.since) args.push(`--since=${options.since}`);
  if (options.withChurn) {
    // `--no-merges` is not optional here: a merge's numstat is the whole
    // branch it brought in, so counting merges double-counts every line and
    // credits it to whoever pressed merge.
    args.push('--numstat', '--no-merges');
  }
  return args;
}

/**
 * Parse the whole output.
 *
 * Total, like every other parser here: a record it cannot understand is
 * dropped rather than guessed at, because one malformed commit should cost one
 * row and not the dashboard.
 */
export function parseHistory(output: string, maxCommits: number): HistoryResult {
  const commits: HistoryCommit[] = [];
  // The first chunk before any sentinel is empty (or shell noise); skip it.
  const chunks = output.split(RECORD).slice(1);

  for (const chunk of chunks) {
    const commit = parseRecord(chunk);
    if (commit) commits.push(commit);
  }

  // The walk asked for one more than the cap precisely so this is knowable.
  const truncated = commits.length > maxCommits;
  return { commits: truncated ? commits.slice(0, maxCommits) : commits, truncated };
}

function parseRecord(chunk: string): HistoryCommit | null {
  // The header is the first line; `--numstat` file lines follow it.
  const newline = chunk.indexOf('\n');
  const header = newline === -1 ? chunk : chunk.slice(0, newline);
  const fields = header.split(FIELD);
  if (fields.length < FIELD_COUNT) return null;

  const [sha, at, authorName, authorEmail, subject] = fields as [
    string,
    string,
    string,
    string,
    string,
    ...string[],
  ];
  const seconds = Number(at);
  if (sha.length === 0 || !Number.isFinite(seconds)) return null;

  const commit: HistoryCommit = {
    sha,
    at: seconds,
    authorName,
    authorEmail,
    // A subject can itself contain the field separator only if someone put a
    // NUL in a commit message, which git forbids — but rejoining the tail is
    // free insurance and keeps a weird subject whole rather than truncated.
    subject: fields.length > FIELD_COUNT ? fields.slice(FIELD_COUNT - 1).join(FIELD) : subject,
  };

  if (newline !== -1) {
    const files = parseNumstatLines(chunk.slice(newline + 1));
    if (files.length > 0) commit.files = files;
  }
  return commit;
}

/**
 * `--numstat` lines: `<insertions>\t<deletions>\t<path>`.
 *
 * **Line-oriented, unlike `commands/log.ts`'s `parseNumstat`**, which reads the
 * `-z` form where git NUL-separates the fields and splits a rename into three
 * tokens. This traversal cannot use `-z`: it needs a record sentinel to tell a
 * commit header from the file lines beneath it, and `-z` removes the newlines
 * that would otherwise distinguish them. Hence two parsers for one flag — they
 * read genuinely different output.
 *
 * This one also keeps a binary file's counts as `null` rather than flattening
 * them to 0, which the churn table depends on.
 *
 * Two shapes need care. A **binary** file prints `-` for both counts, which is
 * not zero — it means "not expressible in lines", and summing it as 0 would
 * silently drop a 40MB asset from the churn table while claiming it changed
 * nothing. A **rename** prints `old => new` or a braced form inside the path;
 * the post-rename path is the one worth attributing to.
 */
export function parseNumstatLines(block: string): FileChange[] {
  const files: FileChange[] = [];
  for (const line of block.split('\n')) {
    if (line.length === 0) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const [added, removed, rawPath] = parts as [string, string, string, ...string[]];
    const path = renameTarget(parts.slice(2).join('\t') || rawPath);
    if (path.length === 0) continue;
    files.push({
      path,
      insertions: added === '-' ? null : toCount(added),
      deletions: removed === '-' ? null : toCount(removed),
    });
  }
  return files;
}

/**
 * The post-rename path.
 *
 * git writes renames two ways depending on the common prefix:
 *   `src/old.ts => src/new.ts`
 *   `src/{old => new}.ts`
 * Both name one file; attributing churn to the old path would scatter a
 * renamed file's history across names that no longer exist.
 */
export function renameTarget(path: string): string {
  const braced = /^(.*)\{(.*) => (.*)\}(.*)$/.exec(path);
  if (braced) {
    const [, prefix, , to, suffix] = braced as unknown as [string, string, string, string, string];
    // The brace form collapses `a/{ => b}/c` to an empty side; strip the double
    // slash that leaves rather than inventing a directory named "".
    return `${prefix}${to}${suffix}`.replace(/\/{2,}/g, '/');
  }
  const arrow = path.split(' => ');
  return (arrow.length === 2 ? arrow[1] : path)?.trim() ?? path;
}

const toCount = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

/** Run the traversal against a real repository. */
export async function readHistory(
  repoPath: string,
  options: HistoryOptions,
): Promise<HistoryResult> {
  const result = await execGit(repoPath, historyArgs(options));
  // A repository with no commits exits non-zero on `log`; that is an empty
  // history, not a failure, and every aggregator handles an empty list.
  if (result.exitCode !== 0) return { commits: [], truncated: false };
  return parseHistory(result.stdout, options.maxCommits);
}
