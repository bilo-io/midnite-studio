import type { RepoHealth } from '@midnite/studio-shared';
import { STALE_BRANCH_DAYS } from '@midnite/studio-shared';

import { execGit } from '../exec/git-exec';

/**
 * The repository's own condition, as distinct from what people did in it.
 *
 * This one does **not** ride the commit traversal, and cannot: every figure
 * here is about refs and objects rather than commits, so there is no version of
 * "one pass" that produces it. It is cheap regardless — `for-each-ref` and
 * `count-objects` read metadata, not history.
 *
 * **Stale and merged are counted separately.** They answer different questions:
 * "nobody has touched this in three months" and "this is already in the default
 * branch, so deleting it loses nothing". A branch can be either, both or
 * neither, and collapsing them would hide the actionable case (merged, and
 * therefore safe to delete) inside the merely-quiet one.
 */

const FIELD = '\x00';

/** `for-each-ref` format: committer date, then the ref name. NUL-separated. */
export const REF_FORMAT = `%(committerdate:unix)${FIELD}%(refname)`;

export type RefRow = { at: number; refName: string };

/** Total, like every parser here — an unreadable row is dropped, not guessed. */
export function parseRefRows(output: string): RefRow[] {
  const rows: RefRow[] = [];
  for (const line of output.split('\n')) {
    if (line.length === 0) continue;
    const [at, refName] = line.split(FIELD);
    const seconds = Number(at);
    if (!refName || !Number.isFinite(seconds)) continue;
    rows.push({ at: seconds, refName });
  }
  return rows;
}

/** Bytes from `count-objects -vH`'s `size-pack: 12.34 MiB` lines. */
export function parseCountObjects(output: string): { sizeBytes: number | null; loose: number | null } {
  const number = (label: string): number | null => {
    const match = new RegExp(`^${label}: (\\d+)$`, 'm').exec(output);
    return match?.[1] === undefined ? null : Number(match[1]);
  };
  const human = (label: string): number | null => {
    const match = new RegExp(`^${label}: ([\\d.]+) (\\w+)$`, 'm').exec(output);
    if (!match) return null;
    const value = Number(match[1]);
    const unit = UNITS[match[2] ?? ''];
    return Number.isFinite(value) && unit ? value * unit : null;
  };

  const loose = number('count');
  // `-H` prints human sizes; both `size` (loose) and `size-pack` matter, and a
  // repo that has never been gc'd carries most of its bytes in the former.
  const packed = human('size-pack') ?? 0;
  const looseSize = human('size') ?? 0;
  const total = packed + looseSize;
  return { sizeBytes: total > 0 ? Math.round(total) : null, loose };
}

const UNITS: Record<string, number> = {
  bytes: 1,
  KiB: 1024,
  MiB: 1024 ** 2,
  GiB: 1024 ** 3,
  TiB: 1024 ** 4,
};

/** Local branches already contained in `target`. */
export function mergedNames(output: string): Set<string> {
  return new Set(
    output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  );
}

export async function readHealth(
  repoPath: string,
  now: () => number = Date.now,
): Promise<RepoHealth> {
  const [localRes, remoteRes, tagRes, objectsRes, headRes] = await Promise.all([
    execGit(repoPath, ['for-each-ref', `--format=${REF_FORMAT}`, 'refs/heads']),
    execGit(repoPath, ['for-each-ref', '--format=%(refname)', 'refs/remotes']),
    execGit(repoPath, ['for-each-ref', '--format=%(refname)', 'refs/tags']),
    execGit(repoPath, ['count-objects', '-vH']),
    // The default branch to measure "merged" against. `HEAD` rather than a
    // guess at `main`/`master`: the checked-out branch is what the user is
    // actually integrating into, and guessing a name is wrong in any repo that
    // uses a different one.
    execGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']),
  ]);

  const local = localRes.exitCode === 0 ? parseRefRows(localRes.stdout) : [];
  const head = headRes.exitCode === 0 ? headRes.stdout.trim() : '';

  let merged = new Set<string>();
  if (head.length > 0 && head !== 'HEAD') {
    const mergedRes = await execGit(repoPath, ['for-each-ref', '--format=%(refname:short)', '--merged', head, 'refs/heads']);
    if (mergedRes.exitCode === 0) merged = mergedNames(mergedRes.stdout);
    // The branch you are on is trivially merged into itself; counting it would
    // make every repository report at least one deletable branch.
    merged.delete(head);
  }

  const cutoff = now() / 1000 - STALE_BRANCH_DAYS * 86_400;
  const staleByAge = local.filter((row) => row.at < cutoff).length;

  const unmerged = local.filter((row) => !merged.has(shortName(row.refName)));
  const oldestUnmergedAt = unmerged.reduce<number | null>(
    (oldest, row) => (oldest === null || row.at < oldest ? row.at : oldest),
    null,
  );

  const objects =
    objectsRes.exitCode === 0
      ? parseCountObjects(objectsRes.stdout)
      : { sizeBytes: null, loose: null };

  return {
    localBranches: local.length,
    remoteBranches: remoteRes.exitCode === 0 ? countLines(remoteRes.stdout) : 0,
    tags: tagRes.exitCode === 0 ? countLines(tagRes.stdout) : 0,
    staleByAge,
    mergedBranches: merged.size,
    oldestUnmergedAt,
    sizeBytes: objects.sizeBytes,
    looseObjects: objects.loose,
  };
}

const shortName = (refName: string): string => refName.replace(/^refs\/heads\//, '');

const countLines = (output: string): number =>
  output.split('\n').filter((line) => line.trim().length > 0).length;
