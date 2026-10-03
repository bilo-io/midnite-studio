import type { CommitDiffStat } from '@midnite/studio-shared';

/**
 * `git log --no-walk=unsorted --numstat -z --no-renames --format=%x01%H%x00%P%x00`
 * into one diff stat per commit.
 *
 * Output shape per commit: `\x01<sha>\0<parents>\0` then one `<added>\t<deleted>\t<path>\0`
 * entry per file. NUL-delimited throughout, so a path with spaces, tabs or a
 * newline cannot be mistaken for a field boundary.
 *
 * - A binary file is `-\t-\t<path>`: it counts as a changed file, adds no lines.
 * - A MERGE commit (more than one parent) maps to `null`. `git log` prints no
 *   diff for a merge unless asked, and a first-parent diff of a merge is the
 *   whole side branch — a number that reads as "this commit changed 4 000 lines"
 *   when it changed none. The column shows an em dash instead.
 */
export function parseCommitNumstat(output: string): Map<string, CommitDiffStat | null> {
  const out = new Map<string, CommitDiffStat | null>();
  // Split only at a marker followed by a sha and NUL, so a path that happens to
  // contain \x01 cannot start a phantom record.
  for (const chunk of output.split(/\x01(?=[0-9a-f]{40,64}\0)/)) {
    if (chunk === '') continue;
    const [sha, parents, ...entries] = chunk.split('\0');
    if (!sha || parents === undefined) continue;
    if (parents.includes(' ')) {
      out.set(sha, null);
      continue;
    }
    let added = 0;
    let deleted = 0;
    let files = 0;
    for (const entry of entries) {
      if (entry === '') continue;
      const match = /^(\d+|-)\t(\d+|-)\t/.exec(entry);
      if (!match) continue;
      files += 1;
      if (match[1] !== '-') added += Number(match[1]);
      if (match[2] !== '-') deleted += Number(match[2]);
    }
    out.set(sha, { added, deleted, files });
  }
  return out;
}
