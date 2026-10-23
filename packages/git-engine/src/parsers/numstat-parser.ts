import type { CommitDiffStat } from '@midnite/studio-shared';

/** One file's line counts, as `--numstat` reports it. A binary file is 0/0. */
export type NumstatFile = { path: string; oldPath: string | null; insertions: number; deletions: number };

/**
 * The flags every per-commit numstat in git-engine is read with — the commit
 * inspector's file list (`readCommitDetail`) and the graph row's Diff column
 * (`readCommitStats`) both take exactly these, so the two cannot count a commit
 * differently.
 *
 * - `-z`: NUL-delimited, so a path with a tab or newline is one field.
 * - `--diff-merges=first-parent`: a MERGE is diffed against its first parent —
 *   what the merge brought onto the branch it landed on. Without it git prints
 *   no diff for a merge at all, and the shorter `-m` would take its mode from
 *   the user's `log.diffMerges` (`remerge` prints nothing for a clean merge).
 * - `--root`: a root commit is diffed against the empty tree, whatever
 *   `log.showRoot` says.
 *
 * Rename detection is left to git's default (`diff.renames`, on unless the user
 * turned it off), which both readers therefore share.
 */
export const COMMIT_NUMSTAT_ARGS = ['--numstat', '-z', '--diff-merges=first-parent', '--root'] as const;

/**
 * Parse `--numstat -z`: `<ins>\t<del>\t<path>\0`, with renames spending two
 * extra NUL tokens (`<ins>\t<del>\t\0<from>\0<to>`). Binary files report `-`
 * for both counts, which read as 0 here — still one file.
 *
 * The single parser every numstat in git-engine goes through: the inspector,
 * the graph row's Diff column, stashes and the working-tree counts.
 */
export function parseNumstat(payload: string): NumstatFile[] {
  const tokens = payload.split('\x00').filter((t) => t.length > 0);
  const files: NumstatFile[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === undefined) continue;
    const parts = token.split('\t');
    if (parts.length < 3) continue;

    // `git log -z` with a `--format` puts a newline between the commit header
    // and the first entry, so that entry's count field reads `\n12`. Strip it
    // explicitly rather than lean on `parseInt` skipping whitespace — the
    // graph row's parser once did not, and dropped every commit's first file.
    const insertions = Number.parseInt((parts[0] ?? '').replace(/^\n+/, ''), 10) || 0;
    const deletions = Number.parseInt(parts[1] ?? '', 10) || 0;
    // Everything after the second tab is the path: a path may hold tabs itself.
    let path = parts.slice(2).join('\t');
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

/** A commit's whole-diff stat: the sum of its per-file numstat. */
export function sumNumstat(files: readonly NumstatFile[]): CommitDiffStat {
  let added = 0;
  let deleted = 0;
  for (const file of files) {
    added += file.insertions;
    deleted += file.deletions;
  }
  return { added, deleted, files: files.length };
}

/**
 * `git log --no-walk=unsorted --format=%x01%H%x00%P%x00` plus
 * {@link COMMIT_NUMSTAT_ARGS}, into one diff stat per commit.
 *
 * Output shape per commit: `\x01<sha>\0<parents>\0` then the commit's
 * `--numstat -z` entries. Each commit's entries go through {@link parseNumstat}
 * — the same parser the inspector's file list uses — and are summed, so a row's
 * `+added −deleted` over `files` is by construction the sum of what the
 * inspector lists for that commit. A merge is counted against its first parent,
 * as the inspector does.
 */
export function parseCommitNumstat(output: string): Map<string, CommitDiffStat> {
  const out = new Map<string, CommitDiffStat>();
  // Split only at a marker followed by a sha and NUL, so a path that happens to
  // contain \x01 cannot start a phantom record.
  // eslint-disable-next-line no-control-regex
  for (const chunk of output.split(/\x01(?=[0-9a-f]{40,64}\0)/)) {
    if (chunk === '') continue;
    const [sha, parents, ...entries] = chunk.split('\0');
    if (!sha || parents === undefined) continue;
    out.set(sha, sumNumstat(parseNumstat(entries.join('\0'))));
  }
  return out;
}
